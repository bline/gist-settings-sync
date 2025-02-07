;(async function () {
  const vscode = acquireVsCodeApi()

  async function getAllUIStateDatabases () {
    if (indexedDB.databases) {
      const dbInfos = await indexedDB.databases()
      return dbInfos
        .filter((info) => info.name && info.name.startsWith('vscode-web-state-db'))
        .map((info) => info.name)
    }
    // Fallback if indexedDB.databases is not available
    return ['vscode-web-state-db-global']
  }

  async function extractDatabase (dbName) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName)
      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: ${dbName}`))
      }
      request.onsuccess = async (event) => {
        const db = event.target.result
        const transaction = db.transaction(db.objectStoreNames, 'readonly')
        const storeNames = Array.from(db.objectStoreNames)
        const storeData = {}
        const storePromises = storeNames.map((storeName) =>
          new Promise((storeResolve, storeReject) => {
            const store = transaction.objectStore(storeName)
            const getAllRequest = store.getAll()
            getAllRequest.onsuccess = () => {
              storeData[storeName] = getAllRequest.result
              storeResolve()
            }
            getAllRequest.onerror = () => {
              storeReject(new Error(`Failed to read store: ${storeName} in ${dbName}`))
            }
          })
        )
        try {
          await Promise.all(storePromises)
          resolve({ dbName, data: storeData })
        } catch (err) {
          reject(err)
        }
      }
    })
  }

  async function syncUIState () {
      // Notify that sync has started.
  vscode.postMessage({ command: 'gistSettingsSync.syncUiStateStart' })
    const exportedData = {}
    try {
      const dbNames = await getAllUIStateDatabases()
      const extractionPromises = dbNames.map((dbName) =>
        extractDatabase(dbName)
          .then((result) => {
            exportedData[result.dbName] = result.data
          })
          .catch((err) => {
            console.error(err)
          })
      )
      await Promise.all(extractionPromises)
      vscode.postMessage({
        command: 'gistSettingsSync.syncUiState',
        uiState: exportedData
      })
    } catch (err) {
      vscode.postMessage({
        command: 'gistSettingsSync.syncUiState',
        error: err.toString()
      })
    } finally {
      // Notify that sync has finished.
      vscode.postMessage({ command: 'gistSettingsSync.syncUiStateFinish' })
    }
  }

  async function setUIState (newState) {
    const dbNames = Object.keys(newState)
    for (const dbName of dbNames) {
      const stateForDb = newState[dbName]
      await new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName)
        request.onerror = () => reject(new Error(`Failed to open DB ${dbName}`))
        request.onsuccess = (event) => {
          const db = event.target.result
          const storeNames = Object.keys(stateForDb)
          if (storeNames.length === 0) {
            resolve()
            return
          }
          const transaction = db.transaction(storeNames, 'readwrite')
          transaction.oncomplete = () => resolve()
          transaction.onerror = () => reject(new Error(`Transaction failed for ${dbName}`))
          for (const storeName of storeNames) {
            const newStoreData = stateForDb[storeName]
            try {
              const objectStore = transaction.objectStore(storeName)
              const clearRequest = objectStore.clear()
              clearRequest.onsuccess = () => {
                if (Array.isArray(newStoreData)) {
                  newStoreData.forEach((item) => {
                    objectStore.add(item)
                  })
                }
              }
              clearRequest.onerror = () => {
                console.error(`Failed to clear store ${storeName} in ${dbName}`)
              }
            } catch (err) {
              console.error(`Store ${storeName} does not exist in ${dbName}`)
            }
          }
        }
      })
    }
  }

  // Run once on login.
  syncUIState()
  // Run periodically using a sync interval injected from the backend.
  setInterval(syncUIState, window.syncIntervalMillis)

  // Listen for incoming messages, for example, to update the UI state.
  window.addEventListener('message', (event) => {
    const message = event.data
    if (message && message.command === 'gistSettingsSync.setUIState') {
      try {
        const newState =
          typeof message.data === 'string'
            ? JSON.parse(message.data)
            : message.data
        setUIState(newState).catch((err) => console.error(err))
      } catch (err) {
        console.error('Error in setUIState:', err)
      }
    }
  })
}())

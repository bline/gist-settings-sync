; (async function () {
  const vscode = acquireVsCodeApi()

  async function getAllUIStateDatabases() {
    if (indexedDB.databases) {
      const dbInfos = await indexedDB.databases()
      return dbInfos
        .filter((info) => info.name && info.name.startsWith('vscode-web-state-db'))
        .map((info) => info.name)
    }
    // Fallback if indexedDB.databases is not available
    return ['vscode-web-state-db-global']
  }

  async function extractDatabase(dbName) {
    return new Promise((resolve, reject) => {
      let request
      try {
        request = indexedDB.open(dbName)
      } catch (e) {
        console.error(`Failed to open IndexedDB: ${dbName}`, e)
        reject(e)
        return
      }
      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: '${dbName}'`))
      }
      request.onsuccess = async (event) => {
        const db = event.target.result
        const transaction = db.transaction(db.objectStoreNames, 'readonly')
        const storeNames = Array.from(db.objectStoreNames)
        const storeData = {}
        const storePromises = storeNames.map((storeName) =>
          new Promise((storeResolve, storeReject) => {
            const store = transaction.objectStore(storeName)
            const cursorRequest = store.openCursor()
            cursorRequest.onsuccess = (event) => {
              const cursor = event.target.result
              if (cursor) {
                const key = cursor.primaryKey
                const value = cursor.value
                if (!storeData[storeName]) {
                  storeData[storeName] = {}
                }
                try {
                  if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('[') || value.startsWith('"'))) {
                    storeData[storeName][key] = JSON.parse(value)
                  } else {
                    storeData[storeName][key] = value
                  }
                } catch (e) {
                  console.warn(`Failed to parse JSON for key '${key}' in store '${storeName}':`, e);
                  storeData[storeName][key] = value
                }
                cursor.continue()
              } else {
                storeResolve()
              }
            }
            cursorRequest.onerror = () => {
              storeReject(new Error(`Failed to read store: '${storeName}' in '${dbName}'`))
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

  async function syncUIState() {
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

  async function setUIState(newState) {
    const dbNames = Object.keys(newState)
    for (const dbName of dbNames) {
      const stateForDb = newState[dbName]
      new Promise((resolve, reject) => {
        let request
        try {
          request = indexedDB.open(dbName)
        } catch (e) {
          console.error(`Failed to open IndexedDB: ${dbName}`, e)
          reject(e)
          return
        }
        request.onerror = () => reject(new Error(`Failed to open DB '${dbName}'`))
        request.onsuccess = (event) => {
          const db = event.target.result
          const storeNames = Object.keys(stateForDb)
          if (storeNames.length === 0) {
            resolve()
            return
          }
          const transaction = db.transaction(storeNames, 'readwrite')
          transaction.oncomplete = () => resolve()
          transaction.onerror = () => reject(new Error(`Transaction failed for '${dbName}'`))
          for (const storeName of storeNames) {
            const newStoreData = stateForDb[storeName]
            try {
              const objectStore = transaction.objectStore(storeName)
              const clearRequest = objectStore.clear()
              clearRequest.onsuccess = () => {
                if (typeof newStoreData === 'object' && newStoreData !== null && newStoreData.constructor === Object) {
                  Object.keys(newStoreData).forEach((key) => {
                    if (newStoreData[key] === undefined) {
                      return
                    }
                    const item = typeof newStoreData[key] === 'string'
                      ? newStoreData[key]
                      : JSON.stringify(newStoreData[key])
                    const addRequest = objectStore.add(item, key)
                    addRequest.onerror = (error) => {
                      console.error(`Failed to add '${key}' to '${storeName}' in '${dbName}'`, error)
                      transaction.abort()
                      resolve({ error })
                    }
                  })
                }
              }
              clearRequest.onerror = (error) => {
                transaction.abort()
                console.error(`Failed to clear store '${storeName}' in '${dbName}'`, error)
                resolve({ error })
              }
            } catch (err) {
              console.error(`Store '${storeName}' does not exist in '${dbName}'`)
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
        setUIState(newState)
          .catch(
            (error) => {
              console.error(error)
              vscode.postMessage({
                command: 'gistSettingsSync.syncUiState',
                error: error.message ? error.message : String(error)
              })
            }
          ).then((state) => {
            if (state.error) {
              vscode.postMessage({
                command: 'gistSettingsSync.syncUiState',
                error: state.error
              })
            }
          })
      } catch (err) {
        console.error('Error in setUIState:', err)
      }
    }
  })
}())

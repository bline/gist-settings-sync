export interface GistFile {
    content: string;
}

export interface GistData {
    files: {
        [key: string]: GistFile;
    };
    description?: string;
    public: boolean;
}


const GIST_FILENAME = "settings-sync.json";


/**
 * Creates a new Gist and returns its ID.
 */
export async function createGist(token: string): Promise<string> {
    const body: GistData = {
        public: false,
        description: "Settings Sync Data",
        files: {
            [GIST_FILENAME]: { content: "{}" }, // Start with an empty JSON object
        },
    };

    const response = await fetch("https://api.github.com/gists", {
        method: "POST",
        headers: {
            Authorization: `token ${token}`,
            "Content-Type": "application/json",
            Accept: "application/vnd.github.v3+json",
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
            `GitHub API error: ${response.status} ${response.statusText}: ${errorText}`
        );
    }

    const gistResponse = await response.json() as { id: string };
    const newGistId = gistResponse.id;

    if (!newGistId) {
        throw new Error("Failed to retrieve new Gist ID from response.");
    }

    return newGistId;
}


export async function uploadGist(
    gistId: string,
    token: string,
    content: string,
): Promise<void> {
    const url = gistId
        ? `https://api.github.com/gists/${gistId}`
        : "https://api.github.com/gists";
    const method = gistId ? "PATCH" : "POST";
    const body: GistData = {
        public: false,
        description: "Settings Sync Data",
        files: {
            [GIST_FILENAME]: { content },
        },
    };
    const response = await fetch(url, {
        method,
        headers: {
            Authorization: `token ${token}`,
            "Content-Type": "application/json",
            Accept: "application/vnd.github.v3+json",
        },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
            `GitHub API error: ${response.status} ${response.statusText}: ${errorText}`,
        );
    }
}

export async function downloadGist(
    gistId: string,
    token: string,
): Promise<string> {
    const url = `https://api.github.com/gists/${gistId}`;
    const response = await fetch(url, {
        method: "GET",
        headers: {
            Authorization: `token ${token}`,
            Accept: "application/vnd.github.v3+json",
        },
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
            `GitHub API error: ${response.status} ${response.statusText}: ${errorText}`,
        );
    }
    const gist = await response.json() as GistData;
    if (
        !gist.files ||
        !gist.files[GIST_FILENAME] ||
        !gist.files[GIST_FILENAME].content
    ) {
        throw new Error("Gist does not contain the expected settings file.");
    }
    return gist.files[GIST_FILENAME].content;
}

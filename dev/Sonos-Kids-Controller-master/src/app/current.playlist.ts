export interface CurrentPlaylist {
    total?: number;
    items: SpotifyItem[];
}

export interface SpotifyItem {
    track:{
        duration_ms: number;
        id: number;
        name: string;
        type: string;
    }
}
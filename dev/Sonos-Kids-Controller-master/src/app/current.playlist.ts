export interface CurrentPlaylist {
    total?: number;
    items: items[];
}

export interface items {
    track:{
        duration_ms: number;
        id: number;
        name: string;
        type: string;
    }
}
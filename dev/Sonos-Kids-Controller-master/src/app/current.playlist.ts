export interface CurrentPlaylist {
    total?: number;
    items?: Item[];
}

export interface Item {
    track:{
        duration_ms?: number;
        id?: number;
        name?: string;
        type?: string;
    }
}
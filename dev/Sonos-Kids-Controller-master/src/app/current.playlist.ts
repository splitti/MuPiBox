export interface CurrentPlaylist {
    total?: number;
    [items: number]:{
        track:{
            duration_ms: number;
            id: number;
            name: string;
            type: string;
        }
    }
}
export interface CurrentEpisode {
    duration_ms?: number;
    id?: string;
    name?: string;
    show?: {
        id?: string;
        name?: string;
        total_episodes?: number;
    };
}
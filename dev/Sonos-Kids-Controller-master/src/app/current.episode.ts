export interface CurrentEpisode {
    duration_ms?: number;
    id?: string;
    name?: string;
    show?: {
        name?: string;
        total_episodes?: number;
    };
}
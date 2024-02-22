export interface Media {
    index?: number;
    artist?: string;
    title?: string;
    query?: string;
    id?: string;
    artistid?: string;
    showid?: string;
    playlistid?: string;
    release_date?: string;
    cover?: string;
    type: string;
    category: string;
    artistcover?: string;
    shuffle?: boolean;
    aPartOfAll?: boolean;
    aPartOfAllMin?: number;
    aPartOfAllMax?: number;
    duration?: string;
    spotify_url?: string;
    resumespotifytrack_number?: number;
    resumespotifyprogress_ms?: number;
    resumespotifyduration_ms?: number;
    resumelocalalbum?: string;
    resumelocalcurrentTracknr?: number;
    resumelocalprogressTime?: number;
    resumerssprogressTime?: number;
}

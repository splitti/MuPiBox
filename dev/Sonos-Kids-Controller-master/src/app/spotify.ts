export interface SpotifyAlbumsResponseImage {
    height: number;
    url: string;
}

export interface SpotifyAlbumsResponseArtist {
    name: string;
}

export interface SpotifyAlbumsResponseItem {
    images: SpotifyAlbumsResponseImage[];
    name: string;
    id: string;
    artists: SpotifyAlbumsResponseArtist[];
}

export interface SpotifyAlbumsResponse {
    albums: {
        total: number;
        items: SpotifyAlbumsResponseItem[];
    };
}

export interface SpotifyArtistsAlbumsResponse {
      total?: number;
      items?: SpotifyAlbumsResponseItem[];
}

export interface SpotifyShowResponse {
    name?: string;
    episodes?: {
        total?: number;
        items?: SpotifyShowResponseItem[];
    };
    images: SpotifyAlbumsResponseImage[];
}

export interface SpotifyShowResponseItem {
    images: SpotifyAlbumsResponseImage[];
    name: string;
    id: string;
    release_date: string;
}

export interface SpotifyEpisodesResponse {
    total?: number;
    items?: SpotifyEpisodesResponseItem[];
}

export interface SpotifyEpisodesResponseItem {
    images?: SpotifyAlbumsResponseImage[];
    name?: string;
    id?: string;
    release_date?: string;
}

export interface SpotifyArtistResponse {
    name?: string;
    images: SpotifyAlbumsResponseImage[];
}

export interface SpotifyEpisodeResponse {
    show: SpotifyShowResponse;
}
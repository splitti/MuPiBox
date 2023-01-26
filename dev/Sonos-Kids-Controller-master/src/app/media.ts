export interface Media {
    index?: number;
    artist?: string;
    title?: string;
    query?: string;
    id?: string;
    artistid?: string;
    showid?: string;
    release_date?: string;
    cover?: string;
    type: string;
    category: string;
    artistcover?: string;
    shuffle?: boolean;
    aPartOfAll?: boolean;
    aPartOfAllMin?: number;
    aPartOfAllMax?: number;
}

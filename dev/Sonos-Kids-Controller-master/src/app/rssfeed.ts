export interface RssFeed {
    rss?: {
      channel?: {
        title?: string;
        image?: {
          url?: string;
        };
        item?: Item[];
      };
    };
  }
  
  export interface Item {
    title?: string;
    link?: string;
    enclosure?: {
      $?: {
        url?: string;
        length?: number;
      };
    };
    'itunes:duration'?: string;
    'itunes:image'?: {
      $?: {
        href?: string;
      };
    };
  }
  
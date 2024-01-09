export interface RssFeed {
    rss?: {
      channel?: {
        title?: {
          _text: string;
        };
        image?: {
          url?: string;
        };
        item?: Item[];
      };
    };
  }
  
  export interface Item {
    title?: {
      _text: string;
    };
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
  
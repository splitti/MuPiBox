export interface RssFeed {
    rss?: {
      channel?: {
        title?: {
          _text: string;
        };
        image?: {
          url?: {
            _text: string;
          };
        };
        item?: Item[];
      };
    };
  }
  
  export interface Item {
    title?: {
      _text: string;
    };
    link?: {
      _text: string;
    };
    pubDate?: {
      _text: string;
    };
    enclosure?: {
      _attributes?: {
        url?: string;
        length?: number;
      };
    };
    'itunes:duration'?: {
      _text: string;
    };
    'itunes:image'?: {
      _attributes?: {
        href?: string;
      };
    };
  }
  
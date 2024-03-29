export interface SonosApiConfig {
    server: string;
    ip: string;
    port: string;
    rooms: string[];
    tts?: {
        enabled?: boolean;
        language?: string;
        volume?: string;
    };
    hat_active: boolean;
}

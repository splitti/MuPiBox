/*
 * File:        led_control.c
 * Author:      Olaf Splitt and ChatGPT
 * Date:        2024/02/19
 * Description: This program will control the power led.
 * Version:     1.0
 * Compiling:   gcc -o led_control led_control.c -lpigpio -ljson-c
 */

#include <string.h>
#include <stdio.h>
#include <stdlib.h>
#include <signal.h>
#include <json-c/json.h>
#include <unistd.h>
#include <pigpio.h>

#define BUFFER_SIZE 1024
#define LED_PULSE_DELAY 1500
#define PULSATION_COUNT 4
#define LED_FADE_DELAY 4000

// Variable zum Zählen der Pulsationen
int pulsation_counter = 0;

// LED-Pins und Helligkeitswerte
int led_gpio;
int led_max_brightness_percent, led_min_brightness_percent;
int led_max_brightness, led_min_brightness, led_dim_mode;


// Signalhandler für SIGTERM
void sigterm_handler(int signum) {
    printf("Programm wird beendet. Letzte Pulsationen der LED...\n");

    for (int i = 0; i < PULSATION_COUNT; ++i) {
        // LED pulsieren von min zu max
        for (int brightness = led_min_brightness; brightness <= led_max_brightness; ++brightness) {
            gpioPWM(led_gpio, brightness);
            usleep(LED_PULSE_DELAY);
        }

        // LED pulsieren von max zu min
        for (int brightness = led_max_brightness; brightness >= led_min_brightness; --brightness) {
            gpioPWM(led_gpio, brightness);
            usleep(LED_PULSE_DELAY);
        }
    }

    gpioWrite(led_gpio, 0); // LED ausschalten
    gpioTerminate();
    exit(0);
}
// Funktion zur Steuerung der LED-Helligkeit mit PWM
void pulse_led(int min_brightness, int max_brightness) {
    int brightness = min_brightness;
    int direction = 1;

    while (pulsation_counter < PULSATION_COUNT) {
        gpioPWM(led_gpio, brightness);
        brightness += direction;

        // Richtung umkehren, wenn Max oder Min Helligkeit erreicht
        if (brightness >= max_brightness || brightness <= min_brightness)
            direction *= -1;

        // Wartezeit für den nächsten Puls
        usleep(LED_PULSE_DELAY);
    }
}

// Funktion zur allmählichen Änderung der LED-Helligkeit
void fade_led(int target_brightness) {
    int current_brightness = gpioGetPWMdutycycle(led_gpio);
    int step = (target_brightness > current_brightness) ? 1 : -1;

    while (current_brightness != target_brightness) {
        current_brightness += step;
        gpioPWM(led_gpio, current_brightness);
        usleep(LED_FADE_DELAY);
    }
}

void print_json_fields() {
    printf("JSON-Values:\n");
    printf("led_gpio: %d\n", led_gpio);
    printf("led_max_brightness_percent: %d\n", led_max_brightness_percent);
    printf("led_min_brightness_percent: %d\n", led_min_brightness_percent);
    printf("led_dim_mode: %d\n", led_dim_mode);
    printf("Brightness-Values:\n");
    printf("led_max_brightness: %d\n", led_max_brightness);
    printf("led_min_brightness: %d\n", led_min_brightness);
}

int main(void) {
    // JSON-Datei einlesen
    FILE *file = fopen("/tmp/.power_led", "r");
    if (file == NULL) {
        fprintf(stderr, "Fehler beim Öffnen der JSON-Datei.\n");
        return 1;
    }

    // Dateigröße bestimmen
    fseek(file, 0, SEEK_END);
    long file_size = ftell(file);
    fseek(file, 0, SEEK_SET);

    // Buffer für den JSON-Inhalt erstellen
    char buffer[BUFFER_SIZE];
    if (file_size > BUFFER_SIZE) {
        fprintf(stderr, "Die JSON-Datei ist zu groß.\n");
        fclose(file);
        return 1;
    }

    // JSON-Datei einlesen
    fread(buffer, 1, file_size, file);
    fclose(file);

    // JSON-Parsing
    struct json_object *json_obj = json_tokener_parse(buffer);
    if (json_obj == NULL) {
        fprintf(stderr, "Fehler beim Parsen der JSON-Datei.\n");
        return 1;
    }

    // Werte aus der JSON-Datei auslesen
    json_object_object_foreach(json_obj, key, val) {
        if (strcmp(key, "led_gpio") == 0)
            led_gpio = json_object_get_int(val);
        else if (strcmp(key, "led_max_brightness") == 0)
            led_max_brightness_percent = json_object_get_int(val);
        else if (strcmp(key, "led_min_brightness") == 0)
            led_min_brightness_percent = json_object_get_int(val);
        else if (strcmp(key, "led_dim_mode") == 0)
            led_dim_mode = json_object_get_int(val);
    }

    // Berechnung der PWM-Helligkeitswerte
    led_max_brightness = (int)(led_max_brightness_percent / 100.0 * 255);
    led_min_brightness = (int)(led_min_brightness_percent / 100.0 * 255);

    // Ausgabe der eingelesenen JSON-Felder
    print_json_fields();

    // Initialisierung von pigpio
    if (gpioInitialise() < 0) {
        fprintf(stderr, "Fehler beim Initialisieren von pigpio.\n");
        return 1;
    }

    // GPIO-Pin für die LED-Kontrolle als PWM-Ausgang konfigurieren
    gpioSetMode(led_gpio, PI_OUTPUT);
    gpioPWM(led_gpio, 0); // LED ausschalten

    int browser_running = 1;
    while (browser_running) {
        if (system("ps -ef | grep chromium-browser | grep http | grep -v grep") == 0) {
            // Browser läuft, beende die Schleife
            browser_running = 0;
            printf("Chromium started\n");
        } else {
            // Browser wurde nicht gefunden, pulsiere LED
            pulse_led(led_min_brightness, led_max_brightness);
        }
    }

    // Signalhandler für SIGTERM registrieren
    signal(SIGTERM, sigterm_handler);

	int prev_led_dim_mode = -1;
	time_t last_modified = 0;

    // Schleife nach Abschluss des initialen Pulsierens
    while (1) {
		struct stat file_stat;
		if (stat("/tmp/.power_led", &file_stat) != -1) {
			time_t current_modified = file_stat.st_mtime;

        // Wenn sich die Datei geändert hat
        if (current_modified != last_modified) {
			FILE *file = fopen("/tmp/.power_led", "r");
			if (file == NULL) {
				fprintf(stderr, "Fehler beim Öffnen der JSON-Datei.\n");
				return 1;
			}

			// JSON-Datei einlesen
			fseek(file, 0, SEEK_SET);
			fread(buffer, 1, file_size, file);
			fclose(file);

			// JSON-Parsing
			struct json_object *json_obj = json_tokener_parse(buffer);
			if (json_obj == NULL) {
				fprintf(stderr, "Fehler beim Parsen der JSON-Datei.\n");
				return 1;
			}

			// Werte aus der JSON-Datei auslesen
			json_object_object_foreach(json_obj, key, val) {
				if (strcmp(key, "led_dim_mode") == 0)
					led_dim_mode = json_object_get_int(val);
			}
			if (led_dim_mode != prev_led_dim_mode) {
				// Überprüfen und Anpassen der LED-Helligkeit basierend auf led_dim_mode
				if (led_dim_mode == 0) {
					// Helligkeit auf led_max_brightness setzen
					fade_led(led_max_brightness);
				} else if (led_dim_mode == 1) {
					// Helligkeit auf led_min_brightness setzen
					fade_led(led_min_brightness);
				}
				printf("led_dim_mode: %d\n", led_dim_mode);
			}
            last_modified = current_modified;
			prev_led_dim_mode = led_dim_mode;
		}
		else {
			fprintf(stderr, "Fehler beim Abrufen der Dateiinformationen.\n");
			return 1;
		}
        // Wartezeit für den nächsten Durchlauf
        sleep(2);

        // Hier können weitere Anpassungen oder Logik eingefügt werden
    }

    // Aufräumen und Beenden
    gpioWrite(led_gpio, 0); // LED ausschalten
    gpioTerminate();

    return 0;
}

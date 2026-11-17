// NFC extension - the spoken messages ("Sprachausgabe"): what the box says when something is in the way of a tag's medium
// (no WLAN, a weak signal, the NAS or Spotify not reachable, a start that does not come), when a tag has no medium yet, and when the
// battery is nearly empty. This file is the logic without the box: which text is said, what the network file and the battery say,
// and how often a message may be said. api.js reads the box and says it (host.say, hostApi 12).
'use strict'

const net = require('node:net')

// ---- the messages ------------------------------------------------------------------------------------------------------------
// id -> the settings that belong to it: `on` (the switch) and `text` (what is said; the German default is the setting's default)
const MESSAGES = {
  noRouter: { on: 'sayNoRouterOn', text: 'sayNoRouterText' },
  wifiTrouble: { on: 'sayWifiTroubleOn', text: 'sayWifiTroubleText' },
  wifiWeak: { on: 'sayWifiWeakOn', text: 'sayWifiWeakText' },
  slowLoad: { on: 'saySlowLoadOn', text: 'saySlowLoadText' },
  nasDown: { on: 'sayNasDownOn', text: 'sayNasDownText' },
  spotifyDown: { on: 'saySpotifyDownOn', text: 'saySpotifyDownText' },
  tagNew: { on: 'sayTagNewOn', text: 'sayTagNewText' },
  lowBattery: { on: 'sayLowBatteryOn', text: 'sayLowBatteryText' },
}

// The default texts in the languages of the app (the box says them in the language it speaks, see languageOf); a language that is not
// here (Arabic, Chinese, ...) says them in English. A text the user wrote is said as it is, in whatever language.
const DEFAULTS = {
  de: {
    noRouter: 'Ich habe keine Verbindung zum WLAN-Router.',
    wifiTrouble: 'Es gibt ein Problem mit der WLAN-Verbindung oder bei der Synchronisation.',
    wifiWeak: 'Das WLAN-Signal ist da, aber zu schwach. Bitte stell mich näher an den Router.',
    slowLoad: 'Das Laden der Inhalte dauert zu lange oder wurde abgebrochen. Versuch es gleich noch einmal.',
    nasDown: 'Das NAS ist vorübergehend nicht erreichbar.',
    spotifyDown: 'Spotify ist vorübergehend nicht erreichbar.',
    tagNew: 'Dieser NFC-Tag wurde noch nicht zugeordnet.',
    lowBattery: 'Bitte stecke mich zum Laden an.',
  },
  en: {
    noRouter: 'I have no connection to the WiFi router.',
    wifiTrouble: 'There is a problem with the WiFi connection or with syncing.',
    wifiWeak: 'There is a WiFi signal, but it is too weak. Please move me closer to the router.',
    slowLoad: 'Loading the content is taking too long or was interrupted. Please try again in a moment.',
    nasDown: 'The NAS is temporarily not reachable.',
    spotifyDown: 'Spotify is temporarily not reachable.',
    tagNew: 'This NFC tag has not been assigned yet.',
    lowBattery: 'Please plug me in to charge.',
  },
  fr: {
    noRouter: "Je n'ai pas de connexion au routeur WiFi.",
    wifiTrouble: 'Il y a un problème avec la connexion WiFi ou la synchronisation.',
    wifiWeak: 'Il y a un signal WiFi, mais il est trop faible. Rapproche-moi du routeur, s\'il te plaît.',
    slowLoad: 'Le chargement du contenu est trop long ou a été interrompu. Réessaie dans un instant.',
    nasDown: "Le NAS est temporairement inaccessible.",
    spotifyDown: 'Spotify est temporairement inaccessible.',
    tagNew: "Ce tag NFC n'a pas encore été associé.",
    lowBattery: 'Branche-moi pour me recharger, s\'il te plaît.',
  },
  es: {
    noRouter: 'No tengo conexión con el router WiFi.',
    wifiTrouble: 'Hay un problema con la conexión WiFi o con la sincronización.',
    wifiWeak: 'Hay señal WiFi, pero es demasiado débil. Acércame al router, por favor.',
    slowLoad: 'La carga del contenido tarda demasiado o se ha interrumpido. Inténtalo de nuevo en un momento.',
    nasDown: 'El NAS no está disponible temporalmente.',
    spotifyDown: 'Spotify no está disponible temporalmente.',
    tagNew: 'Esta etiqueta NFC todavía no está asignada.',
    lowBattery: 'Por favor, enchúfame para cargar.',
  },
  it: {
    noRouter: 'Non ho collegamento con il router WiFi.',
    wifiTrouble: 'C\'è un problema con la connessione WiFi o con la sincronizzazione.',
    wifiWeak: 'Il segnale WiFi c\'è, ma è troppo debole. Avvicinami al router, per favore.',
    slowLoad: 'Il caricamento dei contenuti è troppo lento o è stato interrotto. Riprova tra un momento.',
    nasDown: 'Il NAS al momento non è raggiungibile.',
    spotifyDown: 'Spotify al momento non è raggiungibile.',
    tagNew: 'Questo tag NFC non è ancora stato assegnato.',
    lowBattery: 'Per favore, collegami per la ricarica.',
  },
  nl: {
    noRouter: 'Ik heb geen verbinding met de wifi-router.',
    wifiTrouble: 'Er is een probleem met de wifi-verbinding of met het synchroniseren.',
    wifiWeak: 'Er is wifi-signaal, maar het is te zwak. Zet me alsjeblieft dichter bij de router.',
    slowLoad: 'Het laden van de inhoud duurt te lang of is afgebroken. Probeer het zo nog eens.',
    nasDown: 'De NAS is tijdelijk niet bereikbaar.',
    spotifyDown: 'Spotify is tijdelijk niet bereikbaar.',
    tagNew: 'Deze NFC-tag is nog niet toegewezen.',
    lowBattery: 'Steek me alsjeblieft in het stopcontact om op te laden.',
  },
  da: {
    noRouter: 'Jeg har ingen forbindelse til wifi-routeren.',
    wifiTrouble: 'Der er et problem med wifi-forbindelsen eller synkroniseringen.',
    wifiWeak: 'Der er wifi-signal, men det er for svagt. Sæt mig tættere på routeren.',
    slowLoad: 'Indlæsningen af indholdet tager for lang tid eller blev afbrudt. Prøv igen om lidt.',
    nasDown: 'NAS\'en kan midlertidigt ikke nås.',
    spotifyDown: 'Spotify kan midlertidigt ikke nås.',
    tagNew: 'Dette NFC-tag er ikke tildelt endnu.',
    lowBattery: 'Sæt mig i stikkontakten, så jeg kan lade op.',
  },
  sv: {
    noRouter: 'Jag har ingen anslutning till wifi-routern.',
    wifiTrouble: 'Det är problem med wifi-anslutningen eller synkroniseringen.',
    wifiWeak: 'Det finns wifi-signal, men den är för svag. Flytta mig närmare routern.',
    slowLoad: 'Det tar för lång tid att ladda innehållet, eller det avbröts. Försök igen om en stund.',
    nasDown: 'NAS:en går tillfälligt inte att nå.',
    spotifyDown: 'Spotify går tillfälligt inte att nå.',
    tagNew: 'Den här NFC-taggen har inte tilldelats något än.',
    lowBattery: 'Sätt i mig i laddaren, tack.',
  },
  nb: {
    noRouter: 'Jeg har ingen forbindelse til wifi-ruteren.',
    wifiTrouble: 'Det er et problem med wifi-forbindelsen eller synkroniseringen.',
    wifiWeak: 'Det er wifi-signal, men det er for svakt. Sett meg nærmere ruteren.',
    slowLoad: 'Det tar for lang tid å laste innholdet, eller det ble avbrutt. Prøv igjen om litt.',
    nasDown: 'NAS-en er midlertidig ikke tilgjengelig.',
    spotifyDown: 'Spotify er midlertidig ikke tilgjengelig.',
    tagNew: 'Denne NFC-brikken er ikke tilordnet ennå.',
    lowBattery: 'Sett meg i laderen, takk.',
  },
  fi: {
    noRouter: 'Minulla ei ole yhteyttä WiFi-reitittimeen.',
    wifiTrouble: 'WiFi-yhteydessä tai synkronoinnissa on ongelma.',
    wifiWeak: 'WiFi-signaali on olemassa, mutta liian heikko. Siirrä minut lähemmäs reititintä.',
    slowLoad: 'Sisällön lataaminen kestää liian kauan tai keskeytyi. Yritä hetken päästä uudelleen.',
    nasDown: 'NAS ei ole tilapäisesti tavoitettavissa.',
    spotifyDown: 'Spotify ei ole tilapäisesti tavoitettavissa.',
    tagNew: 'Tätä NFC-tunnistetta ei ole vielä määritetty.',
    lowBattery: 'Laita minut lataukseen, kiitos.',
  },
  pl: {
    noRouter: 'Nie mam połączenia z routerem WiFi.',
    wifiTrouble: 'Jest problem z połączeniem WiFi lub synchronizacją.',
    wifiWeak: 'Sygnał WiFi jest, ale za słaby. Przestaw mnie bliżej routera.',
    slowLoad: 'Wczytywanie zawartości trwa za długo albo zostało przerwane. Spróbuj za chwilę jeszcze raz.',
    nasDown: 'NAS jest chwilowo niedostępny.',
    spotifyDown: 'Spotify jest chwilowo niedostępne.',
    tagNew: 'Ten tag NFC nie został jeszcze przypisany.',
    lowBattery: 'Podłącz mnie, proszę, do ładowania.',
  },
  pt: {
    noRouter: 'Não tenho ligação ao router WiFi.',
    wifiTrouble: 'Há um problema com a ligação WiFi ou com a sincronização.',
    wifiWeak: 'Há sinal WiFi, mas é demasiado fraco. Põe-me mais perto do router, por favor.',
    slowLoad: 'O carregamento do conteúdo está a demorar demasiado ou foi interrompido. Tenta outra vez daqui a pouco.',
    nasDown: 'O NAS está temporariamente inacessível.',
    spotifyDown: 'O Spotify está temporariamente inacessível.',
    tagNew: 'Esta etiqueta NFC ainda não foi atribuída.',
    lowBattery: 'Liga-me à corrente para carregar, por favor.',
  },
  tr: {
    noRouter: 'WiFi yönlendiricisine bağlantım yok.',
    wifiTrouble: 'WiFi bağlantısında veya eşitlemede bir sorun var.',
    wifiWeak: 'WiFi sinyali var ama çok zayıf. Lütfen beni yönlendiriciye yaklaştır.',
    slowLoad: 'İçeriğin yüklenmesi çok uzun sürdü veya yarıda kesildi. Biraz sonra tekrar dene.',
    nasDown: 'NAS geçici olarak erişilemiyor.',
    spotifyDown: 'Spotify geçici olarak erişilemiyor.',
    tagNew: 'Bu NFC etiketi henüz atanmadı.',
    lowBattery: 'Lütfen şarj etmek için beni prize tak.',
  },
  uk: {
    noRouter: 'У мене немає з\'єднання з WiFi-роутером.',
    wifiTrouble: 'Є проблема з WiFi-з\'єднанням або синхронізацією.',
    wifiWeak: 'Сигнал WiFi є, але він надто слабкий. Постав мене ближче до роутера.',
    slowLoad: 'Завантаження вмісту триває надто довго або було перервано. Спробуй ще раз за мить.',
    nasDown: 'NAS тимчасово недоступний.',
    spotifyDown: 'Spotify тимчасово недоступний.',
    tagNew: 'Цей NFC-тег ще не призначено.',
    lowBattery: 'Будь ласка, підключи мене до зарядки.',
  },
  ru: {
    noRouter: 'У меня нет соединения с WiFi-роутером.',
    wifiTrouble: 'Проблема с WiFi-соединением или синхронизацией.',
    wifiWeak: 'Сигнал WiFi есть, но он слишком слабый. Поставь меня ближе к роутеру.',
    slowLoad: 'Загрузка содержимого идёт слишком долго или была прервана. Попробуй ещё раз через минуту.',
    nasDown: 'NAS временно недоступен.',
    spotifyDown: 'Spotify временно недоступен.',
    tagNew: 'Этот NFC-тег ещё не назначен.',
    lowBattery: 'Пожалуйста, подключи меня к зарядке.',
  },
  cs: {
    noRouter: 'Nemám spojení s WiFi routerem.',
    wifiTrouble: 'Je problém s WiFi připojením nebo se synchronizací.',
    wifiWeak: 'WiFi signál je, ale je příliš slabý. Postav mě blíž k routeru.',
    slowLoad: 'Načítání obsahu trvá příliš dlouho nebo bylo přerušeno. Zkus to za chvíli znovu.',
    nasDown: 'NAS je dočasně nedostupný.',
    spotifyDown: 'Spotify je dočasně nedostupný.',
    tagNew: 'Tento NFC tag ještě nebyl přiřazen.',
    lowBattery: 'Připoj mě prosím k nabíječce.',
  },
  el: {
    noRouter: 'Δεν έχω σύνδεση με τον δρομολογητή WiFi.',
    wifiTrouble: 'Υπάρχει πρόβλημα με τη σύνδεση WiFi ή τον συγχρονισμό.',
    wifiWeak: 'Υπάρχει σήμα WiFi, αλλά είναι πολύ αδύναμο. Βάλε με πιο κοντά στον δρομολογητή.',
    slowLoad: 'Η φόρτωση του περιεχομένου αργεί πολύ ή διακόπηκε. Δοκίμασε ξανά σε λίγο.',
    nasDown: 'Το NAS δεν είναι προσωρινά προσβάσιμο.',
    spotifyDown: 'Το Spotify δεν είναι προσωρινά προσβάσιμο.',
    tagNew: 'Αυτή η ετικέτα NFC δεν έχει αντιστοιχιστεί ακόμη.',
    lowBattery: 'Σε παρακαλώ, βάλε με στη φόρτιση.',
  },
}

// The language the box speaks in: mupibox.ttsLanguage of its configuration (Google names Norwegian "no", the app "nb"); German by default
function languageOf(config) {
  const raw = config?.mupibox?.ttsLanguage
  const lang = raw === 'no' ? 'nb' : raw
  return typeof lang === 'string' && /^[a-z]{2}$/.test(lang) ? lang : 'de'
}

// What is said for a message: '' when its switch is off. The text of the settings is said as it is - except when it is the German
// default and the box speaks another language: then it is the default of that language (a box that speaks English does not say
// German because nobody changed the text). Empty text: the default.
function textOf(settings, id, lang) {
  const keys = MESSAGES[id]
  if (!keys || settings?.[keys.on] === false) return ''
  const own = typeof settings?.[keys.text] === 'string' ? settings[keys.text].trim() : ''
  if (own && own !== DEFAULTS.de[id]) return own
  return (DEFAULTS[lang] ?? DEFAULTS.en)[id]
}

// ---- the network ---------------------------------------------------------------------------------------------------------------
// The signal below which the WLAN counts as too weak (dBm; -67 is what video calls need, -75 is where a stream starts to stutter)
const WEAK_DBM = -75

// The signal of the WiFi in dBm from what the network file says ("-61 dBm"); null when there is none
function signalOf(net) {
  const match = /^\s*(-\d{1,3})(?:\.\d+)?\s*dBm/i.exec(String(net?.wifisignal ?? ''))
  return match ? Number(match[1]) : null
}

// What the file network.json (the box writes it every few seconds: onlinestate, wifi = the name of the network, ip, wifisignal) says:
//   'ok'       - online, signal good (or a cable: no WiFi name)
//   'weak'     - online, but the signal is below WEAK_DBM
//   'noRouter' - offline and not joined to a network (no name, no address)
//   'trouble'  - offline although joined (the router does not let the box out, no internet)
//   null       - the file is not there, or does not say yet (the box has just started)
function networkVerdict(net) {
  if (!net || typeof net !== 'object' || typeof net.onlinestate !== 'string' || net.onlinestate === 'starting') return null
  const joined = typeof net.wifi === 'string' && net.wifi.trim() !== ''
  const address = typeof net.ip === 'string' && net.ip.trim() !== ''
  if (net.onlinestate === 'online') {
    const signal = signalOf(net)
    return joined && signal !== null && signal <= WEAK_DBM ? 'weak' : 'ok'
  }
  return joined && address ? 'trouble' : 'noRouter'
}

// The message for a verdict ('ok' and null: none)
const NETWORK_MESSAGE = { noRouter: 'noRouter', trouble: 'wifiTrouble', weak: 'wifiWeak' }

// A medium that needs no network: the SD card's own albums
const needsNetwork = (media) => Boolean(media) && media.type !== 'library'

// The address the box reaches its NAS at (mupiboxconfig nas.address, with or without http://); '' when none is set
function nasUrl(config) {
  const nas = config?.nas
  const address = typeof nas?.address === 'string' ? nas.address.trim() : ''
  if (!address) return ''
  return /^https?:\/\//i.test(address) ? address : `${nas?.https === true ? 'https' : 'http'}://${address}`
}

// ---- the battery ---------------------------------------------------------------------------------------------------------------
const LOW_PERCENT = 10 // said at this charge and below, while the box is not charging
const OK_PERCENT = 15 // said again after the charge was above this (or the box was charging) in between

// What the MuPiHAT says (GET /api/mupihat): the charge when it is a battery that is being used up - else null (no HAT, no battery, values
// not valid, or it is charging)
function dischargingPercent(hat) {
  if (!hat || typeof hat !== 'object') return null
  if (hat.BatteryConnected === 0 || hat.Bat_PercentSource === 'none' || hat.Measurement_Valid === false || hat.BatteryStaleSince) return null
  const percent = Number(hat.Bat_Percent)
  if (!Number.isFinite(percent)) return null
  return Number.isFinite(hat.Ibat) && hat.Ibat > 50 ? null : percent
}

// The watch over the battery: say(…) is true once when the charge falls to LOW_PERCENT, and not again until it was above OK_PERCENT
// (or the box was charging) in between. Feed it every reading of the HAT.
function batteryWatch() {
  let armed = true
  return (hat) => {
    const percent = dischargingPercent(hat)
    // (charging, or no battery data: not low - and the next low is new)
    if (percent === null) {
      if (hat && typeof hat === 'object' && Number.isFinite(Number(hat.Bat_Percent)) && Number(hat.Bat_Percent) > OK_PERCENT) armed = true
      else if (hat && Number.isFinite(hat.Ibat) && hat.Ibat > 50) armed = true
      return false
    }
    if (percent > OK_PERCENT) armed = true
    if (armed && percent <= LOW_PERCENT) {
      armed = false
      return true
    }
    return false
  }
}

// ---- how often ------------------------------------------------------------------------------------------------------------------
// A message is said at most once in `gapMs` (a problem that stays must not make the box talk each time), and not two different
// ones at once: say() takes the text and the id, and says whether it was said. `gaps` gives a message a gap of its own - an
// unassigned tag is told every time it is laid on (gap 0); it is only skipped while the same sentence is still being said.
const OWN_GAPS = { tagNew: 0 }
function makeSpeaker(say, { gapMs = 120000, gaps = OWN_GAPS, now = Date.now } = {}) {
  const last = new Map()
  let busyUntil = 0
  return async (id, text) => {
    if (!text) return false
    const t = now()
    if (t < busyUntil || t - (last.get(id) ?? -Infinity) < (gaps[id] ?? gapMs)) return false
    last.set(id, t)
    // (about as long as it takes to say it, so that the next message comes after this one)
    busyUntil = t + 800 + text.length * 50
    try {
      return (await say(text)) === true
    } catch {
      return false
    }
  }
}

// Whether a request answers within `ms`: any answer, even an error status, says the server is there (a NAS answers its login page
// with 401) - only no answer at all (no route, a timeout, a refused connection) says it is not. fetch is a parameter for the tests.
async function reachable(url, { fetch: get = globalThis.fetch, ms = 6000 } = {}) {
  if (!url) return false
  try {
    await get(url, { method: 'HEAD', signal: AbortSignal.timeout(ms), redirect: 'manual' })
    return true
  } catch {
    return false
  }
}

// Whether a TCP connection to the host of an address is made within `ms` (the NAS: its address may be https with a certificate of its
// own, which a request would refuse - a connection is all that is asked)
function tcpReachable(url, { ms = 6000, connect = net.connect } = {}) {
  let target
  try {
    target = new URL(url)
  } catch {
    return Promise.resolve(false)
  }
  const port = Number(target.port) || (target.protocol === 'https:' ? 443 : 80)
  return new Promise((resolve) => {
    const socket = connect({ host: target.hostname, port })
    const finish = (ok) => {
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(ms, () => finish(false))
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
  })
}

// Whether a start the player did not take is owed to the box's own limits (the day's playing time, a quiet time): then it is not a
// problem of the network. `playtime` is what GET /api/playtime says.
function blockedByLimits(playtime) {
  return playtime?.playtime?.state === 'blocked' || playtime?.state === 'blocked' || playtime?.quiet?.inWindow === true || playtime?.quiet?.state === 'blocked'
}

module.exports = {
  MESSAGES,
  DEFAULTS,
  WEAK_DBM,
  LOW_PERCENT,
  OK_PERCENT,
  NETWORK_MESSAGE,
  languageOf,
  textOf,
  signalOf,
  networkVerdict,
  needsNetwork,
  nasUrl,
  dischargingPercent,
  batteryWatch,
  makeSpeaker,
  reachable,
  tcpReachable,
  blockedByLimits,
}

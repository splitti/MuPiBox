// The admin interface's icons, drawn here instead of loaded from api.iconify.design at every page view (that told a
// third party each visit, and without internet the header showed no battery, WiFi or fan). A small stand-in for the
// iconify-icon element: the same tag and attributes, the icons' SVG inline, 1em big in the text's colour - the pages
// and view.css stay as they were. Made from the Iconify API once (scratchpad build_icons.cjs).
// Licences: Material Design Icons (mdi) Apache-2.0, Material Symbols and Google Material Icons (ic) Apache-2.0,
// Tabler Icons MIT - see LICENSES.md next to this file.
;(() => {
  const ICONS = {
 "ic:outline-power-settings-new": [
  24,
  24,
  "<path fill=\"currentColor\" d=\"M13 3h-2v10h2zm4.83 2.17l-1.42 1.42A6.92 6.92 0 0 1 19 12c0 3.87-3.13 7-7 7A6.995 6.995 0 0 1 7.58 6.58L6.17 5.17A8.93 8.93 0 0 0 3 12a9 9 0 0 0 18 0c0-2.74-1.23-5.18-3.17-6.83\"/>"
 ],
 "ic:outline-restart-alt": [
  24,
  24,
  "<path fill=\"currentColor\" d=\"M6 13c0-1.65.67-3.15 1.76-4.24L6.34 7.34A8 8 0 0 0 4 13c0 4.08 3.05 7.44 7 7.93v-2.02c-2.83-.48-5-2.94-5-5.91m14 0c0-4.42-3.58-8-8-8c-.06 0-.12.01-.18.01l1.09-1.09L11.5 2.5L8 6l3.5 3.5l1.41-1.41l-1.08-1.08c.06 0 .12-.01.17-.01c3.31 0 6 2.69 6 6c0 2.97-2.17 5.43-5 5.91v2.02c3.95-.49 7-3.85 7-7.93\"/>"
 ],
 "material-symbols:logout": [
  24,
  24,
  "<path fill=\"currentColor\" d=\"M5 21q-.825 0-1.412-.587T3 19V5q0-.825.588-1.412T5 3h7v2H5v14h7v2zm11-4l-1.375-1.45l2.55-2.55H9v-2h8.175l-2.55-2.55L16 7l5 5z\"/>"
 ],
 "material-symbols:wifi-1-bar-sharp": [
  24,
  24,
  "<path fill=\"currentColor\" d=\"m12 21l-3.525-3.55q.7-.7 1.613-1.075T12 16t1.913.375t1.612 1.075z\"/>"
 ],
 "material-symbols:wifi-2-bar-sharp": [
  24,
  24,
  "<path fill=\"currentColor\" d=\"m6.35 15.35l-2.1-2.15q1.55-1.55 3.55-2.375T12 10t4.213.838t3.537 2.412l-2.1 2.1q-1.125-1.125-2.588-1.737T12 13t-3.062.613T6.35 15.35M12 21l-3.525-3.55q.7-.7 1.613-1.075T12 16t1.913.375t1.612 1.075z\"/>"
 ],
 "material-symbols:wifi-sharp": [
  24,
  24,
  "<path fill=\"currentColor\" d=\"m6.35 15.35l-2.1-2.15q1.55-1.55 3.55-2.375T12 10t4.213.838t3.537 2.412l-2.1 2.1q-1.125-1.125-2.588-1.737T12 13t-3.062.613T6.35 15.35M2.1 11.1L0 9q2.375-2.425 5.488-3.713T12 4t6.513 1.288T24 9l-2.1 2.1q-1.975-1.975-4.538-3.037T12 7T6.637 8.063T2.1 11.1M12 21l-3.525-3.55q.7-.7 1.613-1.075T12 16t1.913.375t1.612 1.075z\"/>"
 ],
 "mdi:battery": [
  24,
  24,
  "<path fill=\"currentColor\" d=\"M16.67 4H15V2H9v2H7.33A1.33 1.33 0 0 0 6 5.33v15.34C6 21.4 6.6 22 7.33 22h9.34A1.33 1.33 0 0 0 18 20.67V5.33C18 4.6 17.4 4 16.67 4\"/>"
 ],
 "mdi:battery-20": [
  24,
  24,
  "<path fill=\"currentColor\" d=\"M16 17H8V6h8m.67-2H15V2H9v2H7.33A1.33 1.33 0 0 0 6 5.33v15.34C6 21.4 6.6 22 7.33 22h9.34A1.33 1.33 0 0 0 18 20.67V5.33C18 4.6 17.4 4 16.67 4\"/>"
 ],
 "mdi:battery-50": [
  24,
  24,
  "<path fill=\"currentColor\" d=\"M16 13H8V6h8m.67-2H15V2H9v2H7.33A1.33 1.33 0 0 0 6 5.33v15.34C6 21.4 6.6 22 7.33 22h9.34A1.33 1.33 0 0 0 18 20.67V5.33C18 4.6 17.4 4 16.67 4\"/>"
 ],
 "mdi:battery-70": [
  24,
  24,
  "<path fill=\"currentColor\" d=\"M16 10H8V6h8m.67-2H15V2H9v2H7.33A1.33 1.33 0 0 0 6 5.33v15.34C6 21.4 6.6 22 7.33 22h9.34A1.33 1.33 0 0 0 18 20.67V5.33C18 4.6 17.4 4 16.67 4\"/>"
 ],
 "mdi:battery-charging-100": [
  24,
  24,
  "<path fill=\"currentColor\" d=\"M23 11h-3V4l-5 10h3v8M12.67 4H11V2H5v2H3.33A1.33 1.33 0 0 0 2 5.33v15.34C2 21.4 2.6 22 3.33 22h9.34c.73 0 1.33-.6 1.33-1.33V5.33A1.33 1.33 0 0 0 12.67 4\"/>"
 ],
 "mdi:battery-charging-20": [
  24,
  24,
  "<path fill=\"currentColor\" d=\"M23.05 11h-3V4l-5 10h3v8m-6-5h-8V6h8m.67-2h-1.67V2h-6v2H3.38a1.33 1.33 0 0 0-1.33 1.33v15.34c0 .73.6 1.33 1.33 1.33h9.34c.73 0 1.33-.6 1.33-1.33V5.33A1.33 1.33 0 0 0 12.72 4\"/>"
 ],
 "mdi:battery-charging-50": [
  24,
  24,
  "<path fill=\"currentColor\" d=\"M23 11h-3V4l-5 10h3v8m-6-9H4V6h8m.67-2H11V2H5v2H3.33A1.33 1.33 0 0 0 2 5.33v15.34C2 21.4 2.6 22 3.33 22h9.34c.73 0 1.33-.6 1.33-1.33V5.33A1.33 1.33 0 0 0 12.67 4\"/>"
 ],
 "mdi:battery-charging-70": [
  24,
  24,
  "<path fill=\"currentColor\" d=\"M12 10H4V6h8m.67-2H11V2H5v2H3.33A1.33 1.33 0 0 0 2 5.33v15.34C2 21.4 2.6 22 3.33 22h9.34c.73 0 1.33-.6 1.33-1.33V5.33A1.33 1.33 0 0 0 12.67 4M23 11h-3V4l-5 10h3v8z\"/>"
 ],
 "mdi:battery-charging-outline": [
  24,
  24,
  "<path fill=\"currentColor\" d=\"M23.05 11h-3V4l-5 10h3v8M12 20H4l.05-14h8m.67-2h-1.67V2h-6v2H3.38a1.33 1.33 0 0 0-1.33 1.33v15.34c0 .73.6 1.33 1.33 1.33h9.34c.73 0 1.33-.6 1.33-1.33V5.33A1.33 1.33 0 0 0 12.72 4\"/>"
 ],
 "mdi:battery-outline": [
  24,
  24,
  "<path fill=\"currentColor\" d=\"M16 20H8V6h8m.67-2H15V2H9v2H7.33A1.33 1.33 0 0 0 6 5.33v15.34C6 21.4 6.6 22 7.33 22h9.34A1.33 1.33 0 0 0 18 20.67V5.33C18 4.6 17.4 4 16.67 4\"/>"
 ],
 "mdi:fan": [
  24,
  24,
  "<path fill=\"currentColor\" d=\"M12 11a1 1 0 0 0-1 1a1 1 0 0 0 1 1a1 1 0 0 0 1-1a1 1 0 0 0-1-1m.5-9c4.5 0 4.61 3.57 2.25 4.75c-.99.49-1.43 1.54-1.62 2.47c.48.2.9.51 1.22.91c3.7-2 7.68-1.21 7.68 2.37c0 4.5-3.57 4.6-4.75 2.23c-.5-.99-1.56-1.43-2.49-1.62c-.2.48-.51.89-.91 1.23c1.99 3.69 1.2 7.66-2.38 7.66c-4.5 0-4.59-3.58-2.23-4.76c.98-.49 1.42-1.53 1.62-2.45c-.49-.2-.92-.52-1.24-.92C5.96 15.85 2 15.07 2 11.5C2 7 5.56 6.89 6.74 9.26c.5.99 1.55 1.42 2.48 1.61c.19-.48.51-.9.92-1.22C8.15 5.96 8.94 2 12.5 2\"/>"
 ],
 "mdi:fan-off": [
  24,
  24,
  "<path fill=\"currentColor\" d=\"M12.5 2C9.64 2 8.57 4.55 9.29 7.47L15 13.16c.87.21 1.81.65 2.28 1.57c1.18 2.37 4.75 2.27 4.75-2.23c0-3.58-3.98-4.37-7.68-2.37c-.32-.4-.74-.71-1.22-.91c.19-.93.63-1.98 1.62-2.47C17.11 5.57 17 2 12.5 2M3.28 4L2 5.27l2.47 2.46C3.22 7.74 2 8.87 2 11.5c0 3.57 3.96 4.35 7.65 2.37c.32.4.75.72 1.24.92c-.2.92-.64 1.96-1.62 2.45C6.91 18.42 7 22 11.5 22c2.3 0 3.44-1.64 3.44-3.79L18.73 22L20 20.72z\"/>"
 ],
 "tabler:brand-chrome": [
  24,
  24,
  "<g fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\"><path d=\"M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0\"/><path d=\"M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0m3-3h8.4m-5.802 4.5l-4.2 7.275M9.402 13.5l-4.2-7.275\"/></g>"
 ]
}
  class LocalIcon extends HTMLElement {
    static get observedAttributes() {
      return ['icon']
    }
    connectedCallback() {
      this.render()
    }
    attributeChangedCallback() {
      this.render()
    }
    render() {
      const icon = ICONS[this.getAttribute('icon') || '']
      if (!this.style.display) this.style.display = 'inline-block'
      if (!icon) {
        this.innerHTML = ''
        return
      }
      const [w, h, body] = icon
      this.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true" style="display:block">' + body + '</svg>'
    }
  }
  if (!customElements.get('iconify-icon')) customElements.define('iconify-icon', LocalIcon)
})()

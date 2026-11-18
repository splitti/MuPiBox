"""Tests of the OLED driver and the screens - no display and no I2C bus needed: the chip is a list of what was written to it."""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from PIL import Image  # noqa: E402

import oled  # noqa: E402
import render  # noqa: E402


class FakeBus:
    def __init__(self, fail=None):
        self.writes = []
        self.fail = fail

    def write(self, data):
        if self.fail:
            raise self.fail
        self.writes.append(list(data))

    def commands(self):
        return [w for w in self.writes if w[0] == 0x00]

    def data(self):
        return [w for w in self.writes if w[0] == 0x40]


def lit(image, box):
    return sum(1 for x in range(box[0], box[2]) for y in range(box[1], box[3]) if image.getpixel((x, y)))


PLAY = {'view': 'play', 'mode': 'full', 'playing': True, 'album': 'Die drei ??? Kids', 'artist': 'Ulf Blanck', 'title': 'Das Geheimnis der Mumie', 'track': 3, 'tracks': 12, 'elapsed': 75, 'duration': 300, 'volume': 35, 'wifi': 3}


class DisplayTest(unittest.TestCase):
    def test_pack_makes_pages_of_eight_rows(self):
        display = oled.Display(FakeBus(), 'ssd1306', 128, 64)
        image = Image.new('1', (128, 64), 0)
        image.putpixel((3, 9), 1)  # page 1, row 1 of it
        image.putpixel((127, 63), 1)  # page 7, row 7
        data = display.pack(image)
        self.assertEqual(len(data), 1024)
        self.assertEqual(data[128 + 3], 0b10)
        self.assertEqual(data[7 * 128 + 127], 0b10000000)
        self.assertEqual(sum(1 for b in data if b), 2)

    def test_rotate_turns_the_picture_by_180_degrees(self):
        image = Image.new('1', (128, 64), 0)
        image.putpixel((0, 0), 1)
        data = oled.Display(FakeBus(), 'ssd1306', 128, 64, rotate=True).pack(image)
        self.assertEqual(data[7 * 128 + 127], 0b10000000)

    def test_a_ssd1306_starts_with_the_multiplex_of_its_height(self):
        for height, mux, com in ((64, 0x3F, 0x12), (32, 0x1F, 0x02)):
            bus = FakeBus()
            oled.Display(bus, 'ssd1306', 128, height, contrast=99)
            first = bus.commands()[0]
            self.assertEqual(first[1], 0xAE, 'off while it is set up')
            self.assertEqual(first[first.index(0xA8) + 1], mux)
            self.assertEqual(first[first.index(0xDA) + 1], com)
            self.assertEqual(first[first.index(0x81) + 1], 99)
            self.assertEqual(bus.commands()[-1], [0x00, 0xAF], 'then on')

    def test_a_ssd1309_has_no_pump_of_its_own_but_the_same_commands(self):
        bus = FakeBus()
        oled.Display(bus, 'ssd1309', 128, 64)
        self.assertIn(0x8D, bus.commands()[0])

    def test_a_ssd1306_is_drawn_in_one_go_in_horizontal_mode(self):
        bus = FakeBus()
        display = oled.Display(bus, 'ssd1306', 128, 64)
        bus.writes.clear()
        self.assertTrue(display.show(Image.new('1', (128, 64), 1)))
        self.assertEqual(bus.commands(), [[0x00, 0x21, 0, 127, 0x22, 0, 7]])
        self.assertEqual([len(w) for w in bus.data()], [129] * 8, 'one page (128 bytes and the control byte) at a time')

    def test_a_sh1106_is_drawn_page_by_page_from_column_2(self):
        bus = FakeBus()
        display = oled.Display(bus, 'sh1106', 128, 64)
        self.assertEqual(bus.commands()[0][bus.commands()[0].index(0xAD) + 1], 0x8B, 'its own charge pump')
        bus.writes.clear()
        display.show(Image.new('1', (128, 64), 1))
        self.assertEqual(bus.commands(), [[0x00, 0xB0 + p, 0x02, 0x10] for p in range(8)])

    def test_a_picture_that_is_shown_is_not_sent_again(self):
        bus = FakeBus()
        display = oled.Display(bus, 'ssd1306', 128, 32)
        image = Image.new('1', (128, 32), 0)
        self.assertTrue(display.show(image))
        count = len(bus.writes)
        self.assertFalse(display.show(image))
        self.assertEqual(len(bus.writes), count)
        image.putpixel((5, 5), 1)
        self.assertTrue(display.show(image))

    def test_off_and_on_again_draws_the_picture_anew(self):
        bus = FakeBus()
        display = oled.Display(bus, 'ssd1306', 128, 64)
        image = Image.new('1', (128, 64), 0)
        display.show(image)
        display.power(False)
        count = len(bus.writes)
        self.assertTrue(display.show(image), 'the RAM may be gone')
        self.assertGreater(len(bus.writes), count)

    def test_a_display_that_does_not_answer_is_named(self):
        with self.assertRaises(oled.DriverError) as caught:
            oled.Display(FakeBus(fail=OSError(121, 'Remote I/O error')), 'ssd1306', 128, 64)
        self.assertEqual(caught.exception.code, 'no_display')

    def test_a_size_or_controller_that_is_not_known_is_refused(self):
        with self.assertRaises(oled.DriverError):
            oled.Display(FakeBus(), 'ssd1306', 128, 48)
        with self.assertRaises(oled.DriverError):
            oled.Display(FakeBus(), 'ssd1327', 128, 64)

    def test_pack_is_the_same_as_reading_the_pixels_one_by_one(self):
        def by_pixel(image, rotate):
            if rotate:
                image = image.rotate(180)
            pixels = image.load()
            return bytes(sum(1 << bit for bit in range(8) if pixels[x, page * 8 + bit]) for page in range(image.height // 8) for x in range(image.width))
        for height in (64, 32):
            picture = render.Screens(128, height).render(PLAY, 0)
            for rotate in (False, True):
                self.assertEqual(oled.Display(FakeBus(), 'ssd1306', 128, height, rotate=rotate).pack(picture), by_pixel(picture, rotate), (height, rotate))

    def test_only_the_pages_that_changed_are_sent(self):
        image = Image.new('1', (128, 64), 0)
        for controller, window in (('ssd1306', [[0x00, 0x21, 0, 127, 0x22, 3, 3], [0x00, 0x21, 0, 127, 0x22, 6, 7]]), ('ssd1309', [[0x00, 0x21, 0, 127, 0x22, 3, 3], [0x00, 0x21, 0, 127, 0x22, 6, 7]]), ('sh1106', [[0x00, 0xB3, 0x02, 0x10], [0x00, 0xB6, 0x02, 0x10], [0x00, 0xB7, 0x02, 0x10]])):
            bus = FakeBus()
            display = oled.Display(bus, controller, 128, 64)
            display.show(image)
            bus.writes.clear()
            changed = image.copy()
            changed.putpixel((10, 25), 1)  # page 3
            changed.putpixel((20, 50), 1)  # page 6
            changed.putpixel((30, 60), 1)  # page 7
            self.assertTrue(display.show(changed))
            self.assertEqual(bus.commands(), window, controller)
            self.assertEqual(len(bus.data()), 3, controller)

    def test_a_display_that_wakes_gets_its_picture_before_it_goes_on(self):
        bus = FakeBus()
        display = oled.Display(bus, 'ssd1306', 128, 64)
        image = Image.new('1', (128, 64), 1)
        display.show(image)
        display.power(False)
        self.assertEqual(bus.writes[-1], [0x00, 0xAE])
        bus.writes.clear()
        self.assertTrue(display.show(image))
        self.assertEqual(len(bus.data()), 8, 'the whole picture again')
        self.assertEqual(bus.writes[-1], [0x00, 0xAF], 'on last')

    def test_the_end_switches_the_panel_off_and_says_good_bye_only_when_the_box_goes_down(self):
        screens = render.Screens(128, 64)
        for reason, stopping, bye, off in (('quit', True, False, False), ('quit-off', True, False, True), ('stop', False, False, True), ('stop', True, True, True), ('eof', True, False, True)):
            bus = FakeBus()
            display = oled.Display(bus, 'ssd1306', 128, 64)
            display.show(Image.new('1', (128, 64), 1))
            bus.writes.clear()
            slept = []
            oled.finish(display, screens, reason, stopping=lambda: stopping, sleep=slept.append)
            self.assertEqual(bool(bus.data()), bye, reason)
            self.assertEqual(bool(slept), bye, reason)
            self.assertEqual(bus.writes[-1:] == [[0x00, 0xAE]], off, reason)

    def test_systemd_tells_whether_the_box_goes_down(self):
        class Answer:
            def __init__(self, text):
                self.stdout = text

        self.assertTrue(oled.system_stopping(lambda *a, **k: Answer(b'stopping\n')))
        self.assertFalse(oled.system_stopping(lambda *a, **k: Answer(b'running\n')))
        self.assertFalse(oled.system_stopping(lambda *a, **k: Answer(b'degraded\n')))

        def missing(*_a, **_k):
            raise FileNotFoundError('systemctl')
        self.assertFalse(oled.system_stopping(missing))

    def test_contrast_is_kept_between_0_and_255(self):
        bus = FakeBus()
        display = oled.Display(bus, 'ssd1306', 128, 64)
        display.contrast(900)
        display.contrast(-4)
        self.assertEqual(bus.commands()[-2:], [[0x00, 0x81, 255], [0x00, 0x81, 0]])


@unittest.skipIf(os.name == 'nt', 'select() on a pipe: the box is Linux')
class LoopTest(unittest.TestCase):
    def test_the_loop_draws_what_it_is_told_and_ends_on_quit(self):
        bus = FakeBus()
        display = oled.Display(bus, 'ssd1306', 128, 64)
        screens = render.Screens(128, 64)
        r, w = os.pipe()
        os.write(w, (json.dumps({'cmd': 'state', 'state': PLAY}) + '\n' + json.dumps({'cmd': 'contrast', 'value': 40}) + '\n').encode())
        ticks = iter([0.0, 5.0, 6.0, 7.0])
        # (the boot picture first, then - once its time is over - the state)
        os.write(w, b'{"cmd": "quit"}\n')
        reason = oled.run(display, screens, stdin_fd=r, clock=lambda: next(ticks))
        os.close(r)
        os.close(w)
        self.assertEqual(reason, 'quit')
        self.assertIn([0x00, 0x81, 40], bus.commands())

    def test_quit_with_off_says_so(self):
        display = oled.Display(FakeBus(), 'ssd1306', 128, 64)
        r, w = os.pipe()
        os.write(w, b'{"cmd": "quit", "off": true}\n')
        ticks = iter(range(100))
        self.assertEqual(oled.run(display, render.Screens(128, 64), stdin_fd=r, clock=lambda: next(ticks)), 'quit-off')
        os.close(r)
        os.close(w)

    def test_the_view_off_switches_the_panel_off_and_draws_nothing(self):
        bus = FakeBus()
        display = oled.Display(bus, 'ssd1306', 128, 64)
        r, w = os.pipe()
        os.write(w, (json.dumps({'cmd': 'state', 'state': {'view': 'off'}}) + '\n').encode())
        ticks = iter([0.0, 5.0, 6.0, 7.0])
        rounds = iter([False, False, True])
        bus.writes.clear()
        self.assertEqual(oled.run(display, render.Screens(128, 64), stdin_fd=r, clock=lambda: next(ticks), stop=lambda: next(rounds)), 'stop')
        os.close(r)
        os.close(w)
        self.assertEqual(bus.data(), [], 'nothing drawn')
        self.assertEqual(bus.commands(), [[0x00, 0xAE]])
        self.assertFalse(display.is_on)

    def test_the_end_of_stdin_ends_the_loop(self):
        display = oled.Display(FakeBus(), 'ssd1306', 128, 64)
        r, w = os.pipe()
        os.close(w)
        ticks = iter(range(100))
        self.assertEqual(oled.run(display, render.Screens(128, 64), stdin_fd=r, clock=lambda: next(ticks)), 'eof')
        os.close(r)

    def test_a_line_that_is_not_json_is_skipped(self):
        commands, rest, eof = oled.read_commands(b'', _pipe_with(b'nonsense\n{"cmd": "quit"}\n{"cmd":'))
        self.assertEqual(commands, [{'cmd': 'quit'}])
        self.assertEqual(rest, b'{"cmd":')
        self.assertFalse(eof)


def _pipe_with(data):
    r, w = os.pipe()
    os.write(w, data)
    return r


class ScreensTest(unittest.TestCase):
    def setUp(self):
        self.s = render.Screens(128, 64)

    def test_clock_text(self):
        self.assertEqual(render.clock_text(67), '1:07')
        self.assertEqual(render.clock_text(3725), '1:02:05')
        self.assertEqual(render.clock_text(None), '--:--')
        self.assertEqual(render.clock_text(-1), '--:--')

    def test_a_long_line_waits_scrolls_waits_and_starts_over(self):
        self.assertEqual(render.scroll_offset(100, 128, 5), 0, 'it fits')
        width, room = 400, 128
        self.assertEqual(render.scroll_offset(width, room, 0.5), 0, 'waits at the start')
        travel = width - room + render.SCROLL_GAP_PX
        run = travel / render.SCROLL_PX_PER_S
        self.assertGreater(render.scroll_offset(width, room, render.SCROLL_WAIT_S + run / 2), 0)
        self.assertEqual(render.scroll_offset(width, room, render.SCROLL_WAIT_S + run + 0.5), travel, 'waits at the end')
        self.assertEqual(render.scroll_offset(width, room, 2 * render.SCROLL_WAIT_S + run + 0.1), 0, 'and again')

    def test_every_screen_has_the_size_of_the_display(self):
        for height in (64, 32):
            screens = render.Screens(128, height)
            for state in ({'view': 'boot'}, {'view': 'bye'}, {'view': 'off'}, {'view': 'idle'}, {'view': 'idle', 'clock': True, 'time': '07:45', 'date': 'Mo 16.11.'}, {'view': 'info', 'ssid': 'Haus', 'ip': '192.168.1.5', 'version': '5.1.0', 'infoLeft': 0.4}, PLAY, {**PLAY, 'mode': 'mix'}, {**PLAY, 'mode': 'lite'}, {**PLAY, 'playing': False}, {'view': 'play', 'title': 'Kinderradio', 'stream': True}, {'view': 'play', 'overlay': 'volume', 'volume': 50}):
                image = screens.render(state, 3.0)
                self.assertEqual(image.size, (128, height))
                self.assertEqual(image.mode, '1')

    def test_the_boot_and_power_off_pictures_are_not_empty(self):
        self.assertGreater(lit(self.s.render({'view': 'boot'}, 0), (0, 0, 128, 64)), 100)
        self.assertGreater(lit(self.s.render({'view': 'bye'}, 0), (0, 0, 128, 64)), 50)
        self.assertEqual(lit(self.s.render({'view': 'off'}, 0), (0, 0, 128, 64)), 0)

    def test_the_progress_bar_grows_with_the_playing_time(self):
        a = self.s.render({**PLAY, 'mode': 'mix', 'elapsed': 30, 'duration': 300}, 0)
        b = self.s.render({**PLAY, 'mode': 'mix', 'elapsed': 240, 'duration': 300}, 0)
        self.assertLess(lit(a, (0, 0, 128, 2)), lit(b, (0, 0, 128, 2)))
        self.assertEqual(lit(b, (0, 0, 128, 2)), 2 * 102, '80 % of 128 pixels, two rows')

    def test_a_stream_has_a_full_bar_and_no_track_number(self):
        image = self.s.render({'view': 'play', 'title': 'Kinderradio', 'stream': True, 'playing': True, 'mode': 'mix', 'elapsed': 12}, 0)
        self.assertEqual(lit(image, (0, 0, 128, 2)), 256)

    def test_pause_says_so_in_the_bar(self):
        playing = self.s.render(PLAY, 0)
        paused = self.s.render({**PLAY, 'playing': False}, 0)
        self.assertNotEqual(playing.tobytes(), paused.tobytes())

    def test_the_modes_look_different(self):
        pics = {m: self.s.render({**PLAY, 'mode': m}, 0).tobytes() for m in ('full', 'mix', 'lite')}
        self.assertEqual(len(set(pics.values())), 3)

    def test_the_overlays_have_their_shapes(self):
        play = self.s.render({'view': 'play', 'overlay': 'play'}, 0)
        pause = self.s.render({'view': 'play', 'overlay': 'pause'}, 0)
        self.assertGreater(lit(play, (40, 10, 90, 54)), 100)
        self.assertGreater(lit(pause, (40, 10, 90, 54)), 100)
        self.assertEqual(lit(pause, (62, 10, 67, 54)), 0, 'the gap between the two bars')
        low = self.s.render({'view': 'play', 'overlay': 'volume', 'volume': 20}, 0)
        high = self.s.render({'view': 'play', 'overlay': 'volume', 'volume': 90}, 0)
        self.assertLess(lit(low, (44, 28, 114, 36)), lit(high, (44, 28, 114, 36)))
        mute = self.s.render({'view': 'play', 'overlay': 'mute', 'volume': 0}, 0)
        self.assertGreater(lit(mute, (40, 18, 64, 46)), 20, 'the cross')

    def test_a_long_title_scrolls_and_a_short_one_stays(self):
        long_state = {**PLAY, 'title': 'Das Geheimnis der Mumie und der sprechende Papagei vom Kapitän'}
        self.s.render(long_state, 0.0)
        self.assertTrue(self.s.scrolling)
        self.s.render(PLAY | {'title': 'Kurz', 'album': 'A', 'artist': 'B'}, 1.0)
        self.assertFalse(self.s.scrolling)

    def test_a_long_line_can_scroll_once_or_not_at_all(self):
        title = 'Das Geheimnis der Mumie und der sprechende Papagei vom Kapitän'
        state = {**PLAY, 'album': '', 'artist': '', 'title': title}
        width = self.s._canvas()[1].textlength(title, font=self.s.fonts.row)
        cycle = render.scroll_cycle(width, 128)
        # (the first reading starts the line at time 0)
        for mode in ('loop', 'once', 'off'):
            screens = render.Screens(128, 64)
            screens.render({**state, 'scroll': mode}, 0.0)
            self.assertEqual(screens.scrolling, mode != 'off', mode)
        once = render.Screens(128, 64)
        once.render({**state, 'scroll': 'once'}, 0.0)
        once.render({**state, 'scroll': 'once'}, cycle / 2)
        self.assertTrue(once.scrolling, 'on its way')
        after = once.render({**state, 'scroll': 'once'}, cycle + 0.1)
        self.assertFalse(once.scrolling, 'through once: it stays and the driver need not draw again')
        self.assertEqual(after.tobytes(), once.render({**state, 'scroll': 'once'}, cycle + 50).tobytes())
        loop = render.Screens(128, 64)
        loop.render({**state, 'scroll': 'loop'}, 0.0)
        loop.render({**state, 'scroll': 'loop'}, cycle + 0.1)
        self.assertTrue(loop.scrolling, 'loop goes on')
        off = render.Screens(128, 64).render({**state, 'scroll': 'off'}, 0.0)
        self.assertEqual(off.tobytes(), after.tobytes(), 'a line that does not move is cut the same way')
        self.assertGreater(lit(off, (0, 12, 128, 24)), 10)

    def test_a_scrolling_line_moves_but_keeps_to_its_row(self):
        long_state = {**PLAY, 'album': '', 'artist': '', 'title': 'Das Geheimnis der Mumie und der sprechende Papagei vom Kapitän'}
        first = self.s.render(long_state, 0.0)
        later = self.s.render(long_state, 3.0)
        self.assertNotEqual(first.tobytes(), later.tobytes())
        self.assertEqual(lit(later, (0, 28, 128, 52)), 0, 'nothing below its line')

    def test_the_clock_is_shown_when_it_is_wanted(self):
        with_clock = self.s.render({'view': 'idle', 'clock': True, 'time': '07:45', 'date': 'Mo 16.11.'}, 0)
        without = self.s.render({'view': 'idle', 'clock': False, 'time': '07:45'}, 0)
        self.assertNotEqual(with_clock.tobytes(), without.tobytes())

    def test_the_info_bar_runs_down_on_the_small_display(self):
        small = render.Screens(128, 32)
        full = small.render({'view': 'info', 'ssid': 'x', 'ip': 'y', 'version': 'z', 'infoLeft': 1.0}, 0)
        half = small.render({'view': 'info', 'ssid': 'x', 'ip': 'y', 'version': 'z', 'infoLeft': 0.5}, 0)
        self.assertGreater(lit(full, (124, 0, 128, 32)), lit(half, (124, 0, 128, 32)))

    def test_a_long_line_of_the_small_info_page_is_cut(self):
        image = render.Screens(128, 32).render({'view': 'info', 'ssid': 'W' * 80, 'ip': '1', 'version': '2'}, 0)
        self.assertEqual(lit(image, (120, 0, 124, 32)), 0)

    def test_the_network_page_has_the_status_bar_with_the_info_mark_and_three_lines(self):
        info = {'view': 'info', 'ssid': 'Example', 'ip': '192.168.1.1', 'version': 'OLED 1', 'wifi': 2}
        image = self.s.render(info, 0)
        self.assertGreater(lit(image, (84, 0, 96, 9)), 8, 'the (i)')
        for row in ((0, 12, 128, 24), (0, 25, 128, 37), (0, 38, 128, 50)):
            self.assertGreater(lit(image, row), 10)
        self.assertEqual(lit(image, (0, 52, 128, 64)), 0, 'no row at the bottom while nothing plays')
        self.assertGreater(lit(self.s.render({**info, 'playing': True, 'elapsed': 5}, 0), (0, 52, 128, 64)), 10)
        self.assertTrue(self.s.render({**info, 'ssid': 'W' * 60}, 0) and self.s.scrolling)

    def test_the_status_bar_shows_what_is_on(self):
        base = {**PLAY, 'shuffle': False, 'repeat': 'off', 'battery': None, 'output': 'speaker'}
        bar = (0, 0, 128, 9)
        plain = self.s.render(base, 0)
        self.assertGreater(lit(plain, (0, 0, 16, 9)), 10, 'wireless')
        self.assertEqual(lit(plain, (18, 0, 82, 9)), 0, 'no battery, repeat or shuffle')
        self.assertGreater(lit(self.s.render({**base, 'battery': 88}, 0), (18, 0, 50, 9)), 40)
        self.assertGreater(lit(self.s.render({**base, 'shuffle': True}, 0), (68, 0, 82, 9)), 10)
        all_ = self.s.render({**base, 'repeat': 'all'}, 0)
        one = self.s.render({**base, 'repeat': 'track'}, 0)
        self.assertGreater(lit(all_, (50, 0, 66, 9)), 10)
        self.assertNotEqual(all_.tobytes(), one.tobytes())
        pictures = {k: self.s.render({**base, 'output': k}, 0).crop((117, 0, 128, 9)).tobytes() for k in ('speaker', 'headphone', 'bluetooth')}
        self.assertEqual(len(set(pictures.values())), 3, 'the speaker, the headphones and Bluetooth look different')
        self.assertNotEqual(self.s.render({**base, 'volume': 35}, 0).crop((95, 0, 128, 9)).tobytes(), self.s.render({**base, 'volume': 100}, 0).crop((95, 0, 128, 9)).tobytes())
        self.assertEqual(lit(self.s.render({**base, 'wifi': -1}, 0), (9, 0, 16, 9)), 0, 'no bars without wireless')

    def test_the_wired_network_shows_the_plug_in_place_of_the_aerial(self):
        base = {**PLAY, 'battery': None}
        wifi = self.s.render(base, 0)
        lan = self.s.render({**base, 'lan': True}, 0)
        self.assertNotEqual(wifi.crop((0, 0, 16, 9)).tobytes(), lan.crop((0, 0, 16, 9)).tobytes())
        self.assertEqual(lit(lan, (15, 0, 18, 9)), 0, 'the plug stays within the room of the aerial')
        self.assertEqual(lit(lan, (0, 0, 15, 9)), sum(row.count('#') for row in render.LAN))
        self.assertEqual(lit(self.s.render({**base, 'lan': True, 'wifi': -1}, 0), (0, 0, 15, 9)), lit(lan, (0, 0, 15, 9)), 'the bars do not matter')
        info = self.s.render({'view': 'info', 'lan': True, 'ssid': 'Haus', 'ip': '192.168.1.9', 'version': 'OLED 1'}, 0)
        self.assertNotEqual(info.tobytes(), self.s.render({'view': 'info', 'ssid': 'Haus', 'ip': '192.168.1.9', 'version': 'OLED 1'}, 0).tobytes())
        for size in ((128, 32), (128, 64)):
            small = render.Screens(*size)
            for mode in ('full', 'mix', 'lite'):
                self.assertTrue(small.render({**base, 'lan': True, 'mode': mode}, 0))
            self.assertTrue(small.render({'view': 'idle', 'clock': True, 'time': '07:45', 'date': 'Mo', 'lan': True}, 0))

    def test_the_status_bar_is_the_drawing_pixel_by_pixel(self):
        # (the pictures of the layout drawing: the grid of each, read off cell by cell; the repeat marker beside the arrows is left out)
        state = {**PLAY, 'wifi': 4, 'battery': 88, 'repeat': 'off', 'shuffle': True, 'output': 'speaker', 'volume': 100, 'timeMode': 'up'}
        image = self.s.render(state, 0)

        def grid(x, y, w, h):
            return [''.join('#' if image.getpixel((x + i, y + j)) else '.' for i in range(w)) for j in range(h)]
        antenna = ['#########......', '#...#...#......', '.#..#..#.......', '..#.#.#.......#', '...###......#.#', '....#.....#.#.#', '....#...#.#.#.#', '....#.#.#.#.#.#', '....#.#.#.#.#.#']
        self.assertEqual(grid(0, 0, 15, 9), antenna)
        eighty_eight = ['.###...###.', '#...#.#...#', '#...#.#...#', '#...#.#...#', '.###...###.', '#...#.#...#', '#...#.#...#', '#...#.#...#', '.###...###.']
        self.assertEqual(grid(17, 0, 11, 9), eighty_eight)
        battery = ['..##################', '..#................#', '###.##.##.##.##.##.#', '#.#.##.##.##.##.##.#', '#.#.##.##.##.##.##.#',
                   '#.#.##.##.##.##.##.#', '###.##.##.##.##.##.#', '..#................#', '..##################']
        self.assertEqual(grid(30, 0, 20, 9), battery)
        shuffle = ['.........#...', '.........##..', '.####.######.', '....#.#..##..', '.....#...#...', '....#.#..##..', '.####.######.', '.........##..', '.........#...']
        self.assertEqual(grid(72, 0, 13, 9), shuffle)
        hundred = ['#...###...###.', '#..#...#.#...#', '#..#...#.#...#', '#..#.#.#.#.#.#', '#..#...#.#...#', '#..#...#.#...#', '#...###...###.']
        self.assertEqual(grid(105, 1, 14, 7), hundred)
        speaker = ['.....#', '....##', '.#####', '#..###', '#..###', '#..###', '.#####', '....##', '.....#']
        self.assertEqual(grid(121, 0, 6, 9), speaker)

    def test_the_repeat_arrows_are_the_drawing_and_the_marker_follows(self):
        repeat = ['........#.....', '........##....', '..#########.#.', '........##..#.', '..#...#.#...#.', '.##..##.....#.', '..#.#########.', '..#..##.......', '..#...#.......']
        for kind in ('all', 'track'):
            image = self.s.render({**PLAY, 'repeat': kind, 'shuffle': False}, 0)
            got = [''.join('#' if image.getpixel((51 + i, j)) else '.' for i in range(14)) for j in range(9)]
            self.assertEqual(got, repeat, kind)
        all_ = self.s.render({**PLAY, 'repeat': 'all', 'shuffle': False}, 0).crop((66, 0, 71, 9)).tobytes()
        one = self.s.render({**PLAY, 'repeat': 'track', 'shuffle': False}, 0).crop((66, 0, 71, 9)).tobytes()
        self.assertNotEqual(all_, one, 'A or 1')

    def test_the_bottom_row_counts_up_or_down(self):
        up = self.s.render({**PLAY, 'timeMode': 'up'}, 0)
        down = self.s.render({**PLAY, 'timeMode': 'down'}, 0)
        self.assertNotEqual(up.tobytes(), down.tobytes())
        row = (0, 53, 128, 64)
        self.assertGreater(lit(up, row), 20)
        # (a stream has no end to count down to: it counts up)
        self.assertEqual(self.s.render({**PLAY, 'timeMode': 'down', 'duration': None}, 0).tobytes(), self.s.render({**PLAY, 'timeMode': 'up', 'duration': None}, 0).tobytes())

    def test_the_bottom_row_gives_up_the_word_track_when_the_numbers_are_wide(self):
        wide = self.s.render({**PLAY, 'elapsed': 3725, 'track': 123, 'tracks': 456, 'timeMode': 'down', 'duration': 4000}, 0)
        self.assertGreater(lit(wide, (100, 53, 128, 64)), 5, 'the track still stands at the right edge')


if __name__ == '__main__':
    unittest.main()

"""Tests of the touch display: the cube, the gestures, the two chips and the program - no display, no bus and no finger needed."""
import contextlib
import io
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from PIL import Image  # noqa: E402

import cube  # noqa: E402
import gesture  # noqa: E402
import lcd  # noqa: E402
import touchlcd  # noqa: E402

SIZE = (240, 320)


def plain(color):
    return Image.new('RGB', SIZE, color)


# ---- the pictures -------------------------------------------------------------------------------------------------------------------
class CubeTest(unittest.TestCase):
    def test_a_point_is_two_bytes_red_5_green_6_blue_5_high_byte_first(self):
        self.assertEqual(cube.rgb565(Image.new('RGB', (1, 1), (255, 0, 0))), bytes([0xF8, 0x00]))
        self.assertEqual(cube.rgb565(Image.new('RGB', (1, 1), (0, 255, 0))), bytes([0x07, 0xE0]))
        self.assertEqual(cube.rgb565(Image.new('RGB', (1, 1), (0, 0, 255))), bytes([0x00, 0x1F]))
        self.assertEqual(cube.rgb565(Image.new('RGB', (1, 1), (255, 255, 255))), bytes([0xFF, 0xFF]))
        self.assertEqual(len(cube.rgb565(plain((1, 2, 3)))), 240 * 320 * 2)

    def test_the_corners_of_a_face_land_where_they_are_told_to(self):
        quad = [(10, 20), (200, 40), (190, 300), (30, 280)]
        face = [(0, 0), (240, 0), (240, 320), (0, 320)]
        c = cube._coefficients(quad, face)
        for (x, y), (u, v) in zip(quad, face):
            d = c[6] * x + c[7] * y + 1
            self.assertAlmostEqual((c[0] * x + c[1] * y + c[2]) / d, u, places=6)
            self.assertAlmostEqual((c[3] * x + c[4] * y + c[5]) / d, v, places=6)

    def test_more_than_four_faces_make_a_flatter_prism_whose_covers_touch(self):
        front, side = Image.new('RGB', SIZE, (200, 40, 40)), Image.new('RGB', SIZE, (40, 200, 40))
        self.assertEqual(cube.sides(1), 4)
        self.assertEqual(cube.sides(4), 4)
        self.assertEqual(cube.sides(8), 8)
        for count in (4, 5, 8, 12, 40):
            for direction in ('left', 'right'):
                for progress in (0.1, 0.25, 0.5, 0.75, 0.9):
                    image = cube.cube(front, side, progress, direction, count)
                    for y in (80, 160, 240):
                        row = [image.getpixel((x, y)) for x in range(SIZE[0])]
                        # (the two covers meet: where one ends the other begins; with a cube only the corner of the box leaves the background)
                        if count > 4:
                            self.assertNotIn((0, 0, 0), row, (count, direction, progress, y))
        # (the flatter the prism, the lighter the faces: they turn away less)
        light = lambda count: sum(cube.cube(front, side, 0.5, 'left', count).getpixel((60, 160))[:1])
        self.assertGreater(light(8), light(4))
        self.assertGreaterEqual(light(40), light(8))
        self.assertIs(cube.cube(front, side, 0.0, 'left', 8), front)
        self.assertIs(cube.cube(front, side, 1.0, 'left', 8), side)

    def test_the_cube_starts_with_the_front_face_and_ends_with_the_side_face(self):
        front, side = plain((200, 0, 0)), plain((0, 0, 200))
        self.assertIs(cube.cube(front, side, 0.0), front)
        self.assertIs(cube.cube(front, side, 1.0), side)

    def test_half_way_both_faces_are_seen_the_front_one_on_the_left_for_a_swipe_to_the_left(self):
        front, side = plain((200, 0, 0)), plain((0, 0, 200))
        image = cube.cube(front, side, 0.5, 'left')
        self.assertEqual(image.size, SIZE)
        left, right = image.getpixel((60, 160)), image.getpixel((180, 160))
        self.assertGreater(left[0], 60)
        self.assertLess(left[2], 30)
        self.assertGreater(right[2], 60)
        self.assertLess(right[0], 30)
        # (to the right the same the other way round)
        mirrored = cube.cube(front, side, 0.5, 'right')
        self.assertGreater(mirrored.getpixel((180, 160))[0], 60)
        self.assertGreater(mirrored.getpixel((60, 160))[2], 60)

    def test_a_face_that_turns_away_gets_smaller_and_darker(self):
        front, side = plain((200, 200, 200)), plain((200, 200, 200))
        early = cube.cube(front, side, 0.15, 'left')
        # the front face is nearly as high as the screen, the side face only a sliver
        self.assertGreater(early.getpixel((100, 5))[0], 0)
        late = cube.cube(front, side, 0.85, 'left')
        self.assertLess(late.getpixel((100, 160))[0], 200)

    def test_a_face_is_as_big_as_the_screen_with_or_without_a_cover(self):
        for cover in (None, Image.new('RGB', (500, 300), (10, 120, 30))):
            for show in (False, True):
                self.assertEqual(cube.make_face(cover, 'Trolle Trafikskola', SIZE, show).size, SIZE)
        self.assertEqual(cube.make_face(None, 'Lumi', (320, 240)).size, (320, 240))
        # (a name that does not fit is wrapped and cut, an artist without a name does not fail)
        self.assertEqual(cube.make_face(None, 'x ' * 400, SIZE).size, SIZE)
        self.assertEqual(cube.make_face(None, '', SIZE).size, SIZE)

    def test_artists_without_a_cover_have_their_own_colour(self):
        a = cube.make_face(None, 'Lumi', SIZE).getpixel((10, 100))
        b = cube.make_face(None, 'Batman', SIZE).getpixel((10, 100))
        self.assertNotEqual(a, b)
        self.assertEqual(a, cube.make_face(None, 'Lumi', SIZE).getpixel((10, 100)))

    def test_a_cover_fills_the_width_and_keeps_black_above_and_below(self):
        face = cube.make_face(Image.new('RGB', (100, 100), (255, 0, 0)), 'x', SIZE)
        self.assertEqual(face.getpixel((120, 160)), (255, 0, 0))
        self.assertEqual(face.getpixel((120, 10)), (0, 0, 0))

    def test_the_zoom_and_the_play_symbol(self):
        a, b = plain((255, 0, 0)), plain((0, 0, 255))
        self.assertIs(cube.zoom(a, b, 0.0), a)
        self.assertIs(cube.zoom(a, b, 1.0), b)
        for inward in (True, False):
            self.assertEqual(cube.zoom(a, b, 0.5, inward).size, SIZE)
        symbol = cube.with_play_symbol(a)
        self.assertEqual(symbol.size, SIZE)
        self.assertNotEqual(symbol.getpixel((120, 160)), (255, 0, 0))
        self.assertEqual(symbol.getpixel((2, 2)), (255, 0, 0))
        self.assertEqual(cube.with_play_symbol(a, 0.0).getpixel((120, 160)), (255, 0, 0))


# ---- the finger ---------------------------------------------------------------------------------------------------------------------
def touch(g, points, start=0.0, step=0.02, fingers=1):
    """The events of a finger that goes through `points` and lets go (`fingers`: how many touch, a number or one per point)."""
    events = []
    now = start
    for i, point in enumerate(points):
        events += g.feed(point, now, fingers[i] if isinstance(fingers, (list, tuple)) else fingers)
        now += step
    events += g.feed(None, now)
    return events


class GestureTest(unittest.TestCase):
    def test_a_short_touch_that_stays_is_a_tap(self):
        self.assertEqual(touch(gesture.Gesture(*SIZE), [(100, 100), (101, 101), (100, 102)]), [('tap', (100, 100))])

    def test_a_touch_that_lasts_too_long_is_none(self):
        self.assertEqual(touch(gesture.Gesture(*SIZE), [(100, 100)] * 3, step=0.5), [])

    def test_a_swipe_to_the_left_follows_the_finger_and_turns_to_the_next(self):
        events = touch(gesture.Gesture(*SIZE), [(200, 160), (170, 162), (140, 160), (100, 158)])
        self.assertEqual([e for e in events if e[0] == 'drag'][-1], ('drag', -100))
        self.assertEqual(events[-1], ('swipe', 'next'))

    def test_a_swipe_to_the_right_turns_to_the_previous(self):
        self.assertEqual(touch(gesture.Gesture(*SIZE), [(40, 160), (80, 160), (130, 160)])[-1], ('swipe', 'prev'))

    def test_a_short_slow_drag_turns_back(self):
        events = touch(gesture.Gesture(*SIZE), [(100, 160), (112, 160), (125, 160)], step=0.3)
        self.assertEqual(events[-1], ('cancel', None))

    def test_a_short_quick_flick_is_enough(self):
        self.assertEqual(touch(gesture.Gesture(*SIZE), [(150, 160), (130, 160), (118, 160)], step=0.015)[-1], ('swipe', 'next'))

    def test_a_swipe_up_with_two_fingers_goes_one_level_up_but_one_down_does_nothing(self):
        self.assertEqual(touch(gesture.Gesture(*SIZE), [(120, 250), (122, 200), (121, 150)], fingers=2), [('swipe', 'up')])
        self.assertEqual(touch(gesture.Gesture(*SIZE), [(120, 100), (122, 150), (121, 220)], fingers=2), [])
        # (the second finger may come a little after the first)
        self.assertEqual(touch(gesture.Gesture(*SIZE), [(120, 250), (122, 220), (121, 180), (121, 140)], fingers=[1, 2, 2, 2]), [('swipe', 'up')])

    def test_a_swipe_up_with_one_finger_does_nothing(self):
        self.assertEqual(touch(gesture.Gesture(*SIZE), [(120, 250), (122, 200), (121, 150)]), [])

    def test_two_fingers_do_not_turn_the_cube_or_tap(self):
        events = touch(gesture.Gesture(*SIZE), [(120, 250), (150, 200), (160, 140)], fingers=2)
        self.assertEqual(events, [('swipe', 'up')])
        self.assertEqual(touch(gesture.Gesture(*SIZE), [(200, 160), (170, 160), (100, 160)], fingers=2), [])
        self.assertEqual(touch(gesture.Gesture(*SIZE), [(100, 100), (101, 101), (100, 102)], fingers=2), [])

    def test_a_turn_that_began_under_one_finger_goes_back_when_a_second_one_comes(self):
        events = touch(gesture.Gesture(*SIZE), [(200, 160), (180, 160), (160, 160), (150, 160)], fingers=[1, 1, 2, 2], step=0.3)
        self.assertEqual([e[0] for e in events if e[0] in ('drag', 'swipe', 'cancel')][-1], 'cancel')
        self.assertNotIn(('swipe', 'next'), events)

    def test_a_second_touch_starts_afresh(self):
        g = gesture.Gesture(*SIZE)
        touch(g, [(200, 160), (100, 160)])
        self.assertEqual(touch(g, [(50, 50), (51, 50)], start=5.0), [('tap', (50, 50))])


# ---- the chips ----------------------------------------------------------------------------------------------------------------------
class FakePins:
    def __init__(self):
        self.log = []  # (pin, value) of every write
        self.pwms = []  # (pin, percent) of every backlight setting

    def write(self, pin, value):
        self.log.append((pin, 1 if value else 0))

    def pwm(self, pin, percent):
        self.pwms.append((pin, percent))


class FakeSpi:
    def __init__(self, pins):
        self.pins = pins
        self.sent = []  # (dc, bytes)

    def write(self, data):
        dc = [v for p, v in self.pins.log if p == 25][-1]
        self.sent.append((dc, bytes(data)))


class DisplayTest(unittest.TestCase):
    def make(self, rotation=0):
        pins = FakePins()
        spi = FakeSpi(pins)
        waits = []
        display = lcd.Display(spi, pins, 25, 27, 18, rotation, 60, sleep=waits.append)
        return display, spi, pins, waits

    def commands(self, spi):
        return [data[0] for dc, data in spi.sent if dc == 0]

    def test_it_is_reset_started_and_switched_on_in_the_order_the_chip_wants(self):
        display, spi, pins, waits = self.make()
        self.assertEqual([v for p, v in pins.log if p == 27], [1, 0, 1])
        commands = self.commands(spi)
        self.assertEqual(commands[:3], [0x36, 0x3A, 0xB2])
        self.assertEqual(commands[-3:], [0x21, 0x11, 0x29])
        self.assertIn(0x11, commands)
        self.assertLess(commands.index(0x11), commands.index(0x29))
        self.assertGreaterEqual(max(waits), 0.1)
        self.assertEqual(pins.pwms[-1], (18, 60))
        self.assertTrue(display.on)

    def test_each_turn_has_its_own_memory_access_control(self):
        for rotation, madctl in ((0, 0x00), (90, 0x70), (180, 0xC0), (270, 0xA0)):
            _display, spi, _pins, _w = self.make(rotation)
            self.assertEqual(spi.sent[spi.sent.index((0, bytes([0x36]))) + 1][1], bytes([madctl]), rotation)
        self.assertEqual(self.make(90)[0].width, 320)
        self.assertEqual(self.make(180)[0].width, 240)
        with self.assertRaises(lcd.LcdError):
            self.make(45)

    def test_a_picture_is_sent_as_the_whole_window_and_rgb565(self):
        display, spi, pins, _w = self.make()
        spi.sent.clear()
        display.show(Image.new('RGB', SIZE, (255, 0, 0)))
        self.assertEqual(spi.sent[0], (0, bytes([0x2A])))
        self.assertEqual(spi.sent[1], (1, bytes([0, 0, 0, 239])))
        self.assertEqual(spi.sent[3], (1, bytes([0, 0, 1, 63])))
        self.assertEqual(spi.sent[4], (0, bytes([0x2C])))
        dc, data = spi.sent[5]
        self.assertEqual((dc, len(data), data[:2]), (1, 240 * 320 * 2, bytes([0xF8, 0x00])))
        with self.assertRaises(ValueError):
            display.show(Image.new('RGB', (10, 10)))

    def test_sleep_and_wake_switch_the_backlight_with_the_panel(self):
        display, spi, pins, _w = self.make()
        pins.pwms.clear()
        display.sleep()
        self.assertEqual(pins.pwms[0], (18, 0))
        self.assertFalse(display.on)
        display.wake()
        self.assertEqual(pins.pwms[-1], (18, 60))
        self.assertTrue(display.on)
        display.set_brightness(250)
        self.assertEqual(display.brightness, 100)


class FakeI2c:
    """What the touch chip answers: the register that was written last decides what a read returns."""

    def __init__(self, registers):
        self.registers = registers
        self.register = None
        self.writes = []

    def write(self, data):
        self.writes.append(list(data))
        if len(data) == 2:
            self.register = (data[0] << 8) | data[1]

    def read(self, count):
        data = self.registers.get(self.register, [0] * count)
        return (list(data) + [0] * count)[:count]


def finger_data(x, y):
    # the CST328's layout: [status, x high, y high, x low | y low, pressure]
    return [0x06, x >> 4, y >> 4, ((x & 0x0F) << 4) | (y & 0x0F), 30] + [0] * 22


class TouchTest(unittest.TestCase):
    def chip(self, registers, **options):
        i2c = FakeI2c(registers)
        return lcd.Touch(i2c, FakePins(), 17, 240, 320, sleep=lambda _s: None, **options), i2c

    def test_it_is_found_by_its_identification_and_put_back_to_normal_mode(self):
        ident = [0] * 24
        ident[10], ident[11] = 0xCA, 0xCA
        touch_chip, i2c = self.chip({0xD1F4: ident})
        self.assertTrue(touch_chip.found())
        self.assertEqual(i2c.writes[-1], [0xD1, 0x09])
        other, _ = self.chip({0xD1F4: [0] * 24})
        self.assertFalse(other.found())

    def test_no_finger_is_none_and_a_finger_is_its_point(self):
        chip, _ = self.chip({0xD005: [0]})
        self.assertIsNone(chip.read())
        chip, i2c = self.chip({0xD005: [1], 0xD000: finger_data(100, 200)})
        self.assertEqual(chip.read(), (100, 200))
        self.assertEqual(i2c.writes[-1], [0xD0, 0x05, 0x00], 'the reading is taken: the chip is told')
        # (more fingers than the chip has, or a reading with the high bits set: nothing)
        chip, _ = self.chip({0xD005: [9]})
        self.assertIsNone(chip.read())
        self.assertEqual(chip.fingers, 0)
        chip, _ = self.chip({0xD005: [2], 0xD000: finger_data(100, 200)})
        self.assertEqual(chip.read(), (100, 200))
        self.assertEqual(chip.fingers, 2)
        chip, _ = self.chip({0xD005: [1], 0xD000: finger_data(239, 319)})
        self.assertEqual(chip.read(), (239, 319))

    def test_the_point_is_turned_as_the_picture_is(self):
        for rotation, expected in ((0, (10, 20)), (180, (229, 299)), (90, (20, 229)), (270, (299, 10))):
            chip, _ = self.chip({}, rotation=rotation)
            self.assertEqual(chip.to_screen(10, 20), expected, rotation)
        chip, _ = self.chip({}, flip_x=True)
        self.assertEqual(chip.to_screen(10, 20), (229, 20))
        chip, _ = self.chip({}, flip_y=True)
        self.assertEqual(chip.to_screen(10, 20), (10, 299))
        chip, _ = self.chip({}, swap=True)
        self.assertEqual(chip.to_screen(10, 20), (20, 10))
        chip, _ = self.chip({}, swap=True, rotation=90)
        self.assertEqual(chip.to_screen(10, 20), (10, 299))

    def test_a_point_outside_the_glass_is_pulled_in(self):
        chip, _ = self.chip({})
        self.assertEqual(chip.to_screen(4000, 4000), (239, 319))


# ---- the program --------------------------------------------------------------------------------------------------------------------
class FakeDisplay:
    def __init__(self, width=240, height=320):
        self.width, self.height = width, height
        self.pictures = []
        self.asleep = False
        self.brightness = None

    def show(self, image):
        self.pictures.append(image)

    def sleep(self):
        self.asleep = True

    def wake(self):
        self.asleep = False

    def set_brightness(self, value):
        self.brightness = value


class FakeTouch:
    def __init__(self):
        self.point = None
        self.fingers = 1
        self.broken = False

    def read(self):
        if self.broken:
            raise OSError(5, 'I/O error')
        return self.point


class NoCovers:
    def __init__(self, pictures=None):
        self.pictures = pictures if pictures is not None else {}
        self.asked = []

    def get(self, url):
        self.asked.append(url)
        return self.pictures.get(url)


class Clock:
    def __init__(self):
        self.now = 100.0

    def __call__(self):
        return self.now

    def nap(self, seconds):
        self.now += max(seconds, 0.01)


def face(name, cover=''):
    return {'label': name, 'cover': cover}


class AppTest(unittest.TestCase):
    def make(self, **options):
        self.display, self.touch, self.sent, self.clock = FakeDisplay(), FakeTouch(), [], Clock()
        self.covers = options.pop('covers', NoCovers())
        self.app = touchlcd.App(self.display, self.touch, self.sent.append, self.covers, clock=self.clock, nap=self.clock.nap, **options)
        self.app.command({'cmd': 'view', 'faces': {'prev': face('C'), 'cur': face('A'), 'next': face('B')}, 'transition': 'none'})
        self.display.pictures.clear()
        return self.app

    def finger(self, points, step=0.02, fingers=1):
        self.touch.fingers = fingers
        for point in points:
            self.touch.point = point
            self.clock.now += step
            self.assertTrue(self.app.step())
        self.touch.point = None
        self.clock.now += step
        self.assertTrue(self.app.step())

    def test_a_view_shows_the_current_cover_once(self):
        app = self.make()
        app.command({'cmd': 'view', 'faces': {'prev': None, 'cur': face('A'), 'next': None}, 'transition': 'none'})
        self.assertEqual(len(self.display.pictures), 0, 'the same picture is not sent again')
        app.command({'cmd': 'view', 'faces': {'prev': None, 'cur': face('Z'), 'next': None}, 'transition': 'none'})
        self.assertEqual(len(self.display.pictures), 1)

    def test_a_swipe_to_the_left_turns_the_cube_and_reports_the_next_face(self):
        app = self.make()
        self.finger([(200, 160), (170, 160), (130, 160), (90, 160)])
        self.assertEqual(self.sent, [{'event': 'nav', 'dir': 'next'}])
        # (the cube followed the finger, then it ran out: the last picture is the face B)
        self.assertGreater(len(self.display.pictures), 3)
        self.assertEqual(app.faces['cur'], face('B'))
        self.assertEqual(self.display.pictures[-1].getpixel((120, 160)), app.image_of(face('B')).getpixel((120, 160)))

    def test_a_swipe_to_the_right_reports_the_previous_face(self):
        self.make()
        self.finger([(40, 160), (90, 160), (150, 160)])
        self.assertEqual(self.sent, [{'event': 'nav', 'dir': 'prev'}])

    def test_a_short_drag_turns_back_and_reports_nothing(self):
        app = self.make()
        self.finger([(100, 160), (112, 160), (125, 160)], step=0.3)
        self.assertEqual(self.sent, [])
        self.assertEqual(app.faces['cur'], face('A'))
        self.assertEqual(self.display.pictures[-1].getpixel((120, 160)), app.image_of(face('A')).getpixel((120, 160)))

    def test_with_no_neighbour_the_cube_does_not_turn(self):
        app = self.make()
        app.command({'cmd': 'view', 'faces': {'prev': None, 'cur': face('A'), 'next': None}, 'transition': 'none'})
        self.display.pictures.clear()
        self.finger([(200, 160), (150, 160), (90, 160)])
        self.assertEqual(self.sent, [])
        self.assertEqual(self.display.pictures, [])

    def test_a_tap_and_a_swipe_up_with_two_fingers_are_reported(self):
        self.make()
        self.finger([(120, 160), (121, 161)])
        self.finger([(120, 250), (121, 200), (121, 150)])
        self.assertEqual(self.sent, [{'event': 'tap'}], 'one finger up: nothing')
        self.finger([(120, 250), (121, 200), (121, 150)], fingers=2)
        self.assertEqual(self.sent, [{'event': 'tap'}, {'event': 'up'}])

    def test_press_and_flash_answer_a_tap_and_the_cover_comes_back(self):
        app = self.make()
        app.command({'cmd': 'press'})
        self.assertEqual(len(self.display.pictures), 1)
        self.assertLess(self.display.pictures[-1].getpixel((120, 160))[0], app.image_of(face('A')).getpixel((120, 160))[0] + 1)
        self.clock.now += touchlcd.PRESS_S + 0.1
        app.step()
        self.assertEqual(len(self.display.pictures), 2, 'the cover is back when no answer came')
        app.command({'cmd': 'flash'})
        symbol = self.display.pictures[-1]
        self.assertNotEqual(symbol.getpixel((120, 160)), app.image_of(face('A')).getpixel((120, 160)))
        self.clock.now += touchlcd.FLASH_S + 0.1
        app.step()
        self.assertEqual(len(self.display.pictures), 4)

    def test_a_zoom_goes_through_pictures_to_the_new_cover(self):
        app = self.make()
        app.command({'cmd': 'view', 'faces': {'prev': None, 'cur': face('Q'), 'next': None}, 'transition': 'zoom-in'})
        self.assertGreater(len(self.display.pictures), 2)
        self.assertEqual(self.display.pictures[-1].getpixel((120, 160)), app.image_of(face('Q')).getpixel((120, 160)))

    def test_a_cover_that_comes_later_replaces_the_name(self):
        pictures = {}
        covers = NoCovers(pictures)
        app = self.make(covers=covers)
        app.command({'cmd': 'view', 'faces': {'prev': None, 'cur': face('A', 'http://box/cover.png'), 'next': None}, 'transition': 'none'})
        shown = len(self.display.pictures)
        self.assertIn('http://box/cover.png', covers.asked)
        pictures['http://box/cover.png'] = Image.new('RGB', (100, 100), (255, 0, 0))
        app.dirty.set()
        app.step()
        self.assertEqual(len(self.display.pictures), shown + 1)
        self.assertEqual(self.display.pictures[-1].getpixel((120, 160)), (255, 0, 0))

    def test_the_display_goes_off_after_a_time_without_touch_and_the_touch_that_wakes_it_does_nothing_else(self):
        app = self.make(sleep_after=60)
        self.clock.now += 61
        app.step()
        self.assertTrue(self.display.asleep)
        self.finger([(120, 160), (121, 160)])
        self.assertFalse(self.display.asleep)
        self.assertEqual(self.sent, [], 'a tap that wakes is no tap')
        self.finger([(120, 160), (121, 160)])
        self.assertEqual(self.sent, [{'event': 'tap'}])
        # (never goes off while a finger is on it)
        self.clock.now += 100
        self.touch.point = (10, 10)
        app.step()
        self.assertFalse(self.display.asleep)

    def test_a_touch_chip_that_does_not_answer_ends_the_program_after_a_while(self):
        app = self.make()
        self.touch.broken = True
        results = [app.step() for _ in range(touchlcd.LOST_AFTER)]
        self.assertEqual(results[:-1], [True] * (touchlcd.LOST_AFTER - 1))
        self.assertFalse(results[-1])

    def test_brightness_and_wake_commands(self):
        app = self.make(sleep_after=60)
        app.command({'cmd': 'brightness', 'value': 30})
        self.assertEqual(self.display.brightness, 30)
        self.clock.now += 61
        app.step()
        self.assertTrue(self.display.asleep)
        app.command({'cmd': 'wake'})
        self.assertFalse(self.display.asleep)


class ArgumentsTest(unittest.TestCase):
    def test_the_arguments(self):
        args = touchlcd.parse_args(['--spi', '0.1', '--dc', '24', '--rst', '22', '--bl', '18', '--tp-rst', '17', '--rotation', '90', '--sleep-after', '300', '--show-title', '--touch-flip-x'])
        self.assertEqual((args.spi, args.dc, args.rst, args.bl, args.tp_rst, args.rotation, args.sleep_after), ('0.1', 24, 22, 18, 17, 90, 300))
        self.assertTrue(args.show_title and args.touch_flip_x and not args.touch_swap)
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            touchlcd.parse_args(['--dc', '24'])


@unittest.skipIf(os.name == "nt", "select() works on sockets only on Windows; the box runs Linux")
class LineReaderTest(unittest.TestCase):
    def test_lines_that_come_together_or_in_pieces_are_all_read(self):
        read_end, write_end = os.pipe()
        try:
            reader = touchlcd.LineReader(read_end)
            self.assertEqual(reader.poll(0), [])
            os.write(write_end, b'{"cmd": "a"}\n{"cmd": "b"}\n{"cm')
            self.assertEqual(reader.poll(0.5), ['{"cmd": "a"}', '{"cmd": "b"}'], 'a second line is not held back')
            os.write(write_end, b'd": "c"}\n\n')
            self.assertEqual(reader.poll(0.5), ['{"cmd": "c"}'])
            os.close(write_end)
            write_end = None
            self.assertIsNone(reader.poll(0.5), 'the other end closed')
        finally:
            os.close(read_end)
            if write_end is not None:
                os.close(write_end)


class CoversTest(unittest.TestCase):
    def test_a_cover_is_fetched_in_the_background_and_kept_at_the_size_of_the_screen(self):
        import time

        buffer = io.BytesIO()
        Image.new('RGB', (900, 600), (0, 128, 255)).save(buffer, 'PNG')
        ready = []
        covers = touchlcd.Covers(320, on_ready=lambda: ready.append(1), fetch=lambda url: buffer.getvalue())
        try:
            self.assertIsNone(covers.get('http://box/a.png'))
            for _ in range(100):
                if ready:
                    break
                time.sleep(0.02)
            picture = covers.get('http://box/a.png')
            self.assertIsNotNone(picture)
            self.assertLessEqual(max(picture.size), 320)
            self.assertIsNone(covers.get(''))
        finally:
            covers.stop = True

    def test_a_cover_that_cannot_be_fetched_is_tried_again_only_after_a_while(self):
        import time

        calls = []

        def broken(url):
            calls.append(url)
            raise OSError('no route')

        covers = touchlcd.Covers(320, fetch=broken)
        try:
            covers.get('http://box/x.png')
            for _ in range(100):
                if calls:
                    break
                time.sleep(0.02)
            time.sleep(0.1)
            covers.get('http://box/x.png')
            time.sleep(0.2)
            self.assertEqual(len(calls), 1)
        finally:
            covers.stop = True


if __name__ == '__main__':
    unittest.main()

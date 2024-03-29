from pyaxidraw import axidraw

class Machine:
    def __init__(self, port='/dev/tty.usbmodem14101', dry=False):
        self.dry = dry
        self.ad = axidraw.AxiDraw()
        self.ad.interactive()
        MILLIMETER_FLAG = 2
        self.ad.options.units = MILLIMETER_FLAG
        if not self.dry:
            self.ad.connect()
        else:
            print('Running in DRY mode.')

    def pen_up(self):
        if not self.dry:
            self.ad.penup()
        return 'pen_up'

    def pen_down(self):
        if not self.dry:
            self.ad.pendown()
        return 'pen_down'

    def line(self, pt):
        if not self.dry:
            self.ad.lineto(pt[0], pt[1])
        return f'line {pt}'

    def travel(self, pt):
        if not self.dry:
            self.ad.moveto(pt[0], pt[1])
        return f'travel {pt}'

    def disconnect(self):
        if not self.dry:
            self.ad.disconnect()
        return 'disconnect'

    def return_to_origin(self):
        if not self.dry:
            self.travel((0, 0))
        return 'return_to_origin'

    def plot_rect_hw(self, start_pt, height, width):
        if not self.dry:
            pt1 = (start_pt[0] + width, start_pt[1])
            pt2 = (start_pt[0] + width, start_pt[1] + height)
            pt3 = (start_pt[0], start_pt[1] + height)
            self.travel(start_pt)
            self.line(pt1)
            self.line(pt2)
            self.line(pt3)
            self.line(start_pt)
            self.pen_up()
        return f'square at {start_pt} height {height} width {width}'

    def generate_axidraw_instructions(self, filepath):
        self.ad.plot_setup(filepath)
        self.ad.options.preview = True
        preview_svg, instructions = self.ad.plot_run(True)
        return instructions

    def generate_preview_svg(self, filepath):
        self.ad.plot_setup(filepath)
        self.ad.options.preview = True
        self.ad.options.rendering = 3
        self.ad.options.report_time = True
        preview_svg, _ = self.ad.plot_run(True)
        # TODO: use the time estimate values
        # time_estimate = self.ad.time_estimate
        # distance_total = self.ad.distance_total
        # distance_pendown = self.ad.distance_pendown
        return preview_svg

    def plot_svg(self, filepath):
        if not self.dry:
            try:
                self.ad.plot_setup(filepath)
                self.ad.plot_run()
            except Exception as e:
                print(e)
        return f'plotted {filepath}'


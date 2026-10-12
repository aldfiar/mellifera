# film-name-parsing

Films in serial libraries stay raw filenames: serial-parser skips numberless video files (applies=false), so _view.title is never written and the SPA shows the raw name; the shared grammar also misses AMZN (source), dot-form codecs (H.264), and dash-form trailing group tags (CR-Cassu).

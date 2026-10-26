import type { ThemeDocument } from './lib/theme-model';

// Exact current project snapshot. Keep the internal theme identity for preview behavior.
export const theme: ThemeDocument = {
  "schemaVersion": 2,
  "name": "Untitled",
  "theme": {
    "name": "Grove",
    "text": {
      "l": {
        "size": 24,
        "lineHeight": 32
      },
      "m": {
        "size": 16,
        "lineHeight": 24
      },
      "s": {
        "size": 14,
        "lineHeight": 20
      },
      "xl": {
        "size": 36,
        "lineHeight": 40
      },
      "xs": {
        "size": 12,
        "lineHeight": 16
      },
      "xxl": {
        "size": 48,
        "lineHeight": 52
      },
      "xxs": {
        "size": 10,
        "lineHeight": 14
      }
    },
    "fonts": {
      "ui": {
        "family": "\"Sidebar Geist\", sans-serif",
        "weights": {
          "heavy": 700,
          "medium": 500,
          "regular": 400
        }
      },
      "brand": {
        "family": "\"Sidebar Geist\", sans-serif",
        "weights": {
          "heavy": 700,
          "medium": 500,
          "regular": 400
        }
      },
      "editorial": {
        "family": "\"Sidebar Geist\", sans-serif",
        "weights": {
          "heavy": 700,
          "medium": 500,
          "regular": 400
        }
      },
      "data": {
        "family": "\"Sidebar Geist Mono\", monospace",
        "weights": {
          "heavy": 700,
          "medium": 500,
          "regular": 400
        }
      }
    },
    "border": {
      "l": 2,
      "m": 1,
      "s": 1,
      "none": 0
    },
    "colors": {
      "dark": {
        "error": "#ff5263",
        "color-1": "#76ef6b",
        "color-2": "#00c9bb",
        "color-3": "#f4f83b",
        "color-4": "#e864ff",
        "success": "#76ef6b",
        "warning": "#ffa344",
        "neutral-1": "#000000",
        "neutral-2": "#202020",
        "neutral-3": "#2b2b2b",
        "neutral-4": "#383838",
        "neutral-5": "#505050",
        "neutral-6": "#777777",
        "neutral-7": "#a3a3a3",
        "neutral-8": "#c6c6c6",
        "neutral-9": "#e5e5e5",
        "neutral-10": "#ffffff"
      },
      "light": {
        "error": "#ff5263",
        "color-1": "#76ef6b",
        "color-2": "#00c9bb",
        "color-3": "#E0E709",
        "color-4": "#e864ff",
        "success": "#76ef6b",
        "warning": "#ffa344",
        "neutral-1": "#ffffff",
        "neutral-2": "#fafafa",
        "neutral-3": "#f0f0f0",
        "neutral-4": "#dedede",
        "neutral-5": "#c5c5c5",
        "neutral-6": "#969696",
        "neutral-7": "#6c6c6c",
        "neutral-8": "#454545",
        "neutral-9": "#252525",
        "neutral-10": "#000000"
      }
    },
    "radius": {
      "l": 17.42,
      "m": 8.77,
      "s": 5.87,
      "xl": 26.26,
      "xs": 2.92,
      "full": 9999,
      "zero": 0
    },
    "shadows": {
      "l": {
        "x": 0,
        "y": 12,
        "blur": 30,
        "color": {
          "dark": "neutral-1",
          "light": "neutral-10"
        },
        "spread": 0,
        "opacity": 0
      },
      "m": {
        "x": 0,
        "y": 8,
        "blur": 24,
        "color": {
          "dark": "neutral-1",
          "light": "neutral-10"
        },
        "spread": 0,
        "opacity": 0
      },
      "s": {
        "x": 0,
        "y": 1,
        "blur": 2,
        "color": {
          "dark": "neutral-1",
          "light": "neutral-10"
        },
        "spread": 0,
        "opacity": 0
      }
    },
    "spacing": {
      "l": 24,
      "m": 16,
      "s": 12,
      "xl": 32,
      "xs": 8,
      "xxl": 48,
      "xxs": 4,
      "zero": 0
    },
    "animation": {
      "large": {
        "easing": [
          0.16,
          1,
          0.3,
          1
        ],
        "duration": 300
      },
      "easing": [
        0.2,
        0.8,
        0.2,
        1
      ],
      "duration": 150,
      "popupScale": 0.96,
      "pressDistance": 1
    },
    "iconStyle": "outlined",
    "iconFamily": "Lucide",
    "letterSpacing": {
      "l": 0.01,
      "m": 0,
      "s": -0.01,
      "xl": 0.02,
      "xs": -0.02
    },
    "primaryForeground": {
      "dark": "neutral-2",
      "light": "neutral-9"
    },
    "primaryActionColor": "color-1",
    "colorPalettes": [
      {
        "id": "grove-signal",
        "name": "Signal",
        "description": "Bright green with cyan, electric yellow, and violet accents.",
        "colors": {
          "light": [
            "#76ef6b",
            "#00c9bb",
            "#E0E709",
            "#e864ff"
          ],
          "dark": [
            "#76ef6b",
            "#00c9bb",
            "#f4f83b",
            "#e864ff"
          ]
        },
        "primaryForeground": {
          "light": "neutral-9",
          "dark": "neutral-2"
        }
      },
      {
        "id": "grove-electric",
        "name": "Electric",
        "description": "Electric yellow with green, blue, and violet accents.",
        "colors": {
          "light": [
            "#E0E709",
            "#76ef6b",
            "#009ff0",
            "#e864ff"
          ],
          "dark": [
            "#f4f83b",
            "#76ef6b",
            "#009ff0",
            "#e864ff"
          ]
        },
        "primaryForeground": {
          "light": "neutral-9",
          "dark": "neutral-2"
        }
      },
      {
        "id": "grove-cyan",
        "name": "Cyan",
        "description": "Clear cyan with blue, green, and violet accents.",
        "colors": {
          "light": [
            "#00c9bb",
            "#009ff0",
            "#76ef6b",
            "#e864ff"
          ],
          "dark": [
            "#00c9bb",
            "#009ff0",
            "#76ef6b",
            "#e864ff"
          ]
        },
        "primaryForeground": {
          "light": "neutral-9",
          "dark": "neutral-2"
        }
      },
      {
        "id": "grove-blue",
        "name": "Blue",
        "description": "Vivid blue with cyan, green, and violet accents.",
        "colors": {
          "light": [
            "#009ff0",
            "#00c9bb",
            "#76ef6b",
            "#e864ff"
          ],
          "dark": [
            "#009ff0",
            "#00c9bb",
            "#76ef6b",
            "#e864ff"
          ]
        },
        "primaryForeground": {
          "light": "neutral-9",
          "dark": "neutral-2"
        }
      },
      {
        "id": "grove-violet",
        "name": "Violet",
        "description": "Bright violet with cyan, green, and blue accents.",
        "colors": {
          "light": [
            "#e864ff",
            "#00c9bb",
            "#76ef6b",
            "#009ff0"
          ],
          "dark": [
            "#e864ff",
            "#00c9bb",
            "#76ef6b",
            "#009ff0"
          ]
        },
        "primaryForeground": {
          "light": "neutral-9",
          "dark": "neutral-2"
        }
      },
      {
        "id": "grove-monochrome",
        "name": "Monochrome",
        "description": "Charcoal and clear grays for a neutral technical interface.",
        "colors": {
          "light": [
            "#262626",
            "#707070",
            "#b6b6b6",
            "#e8e8e8"
          ],
          "dark": [
            "#e5e5e5",
            "#b1b1b1",
            "#777777",
            "#424242"
          ]
        },
        "primaryForeground": {
          "light": "neutral-2",
          "dark": "neutral-2"
        }
      },
      {
        "id": "grove-orange",
        "name": "Orange",
        "description": "Bright orange with cyan, green, and violet accents.",
        "colors": {
          "light": [
            "#ffa344",
            "#00c9bb",
            "#76ef6b",
            "#e864ff"
          ],
          "dark": [
            "#ffa344",
            "#00c9bb",
            "#76ef6b",
            "#e864ff"
          ]
        },
        "primaryForeground": {
          "light": "neutral-9",
          "dark": "neutral-2"
        }
      }
    ],
    "paletteBaseNeutrals": {
      "light": {
        "neutral-1": "#ffffff",
        "neutral-2": "#fafafa",
        "neutral-3": "#f0f0f0",
        "neutral-4": "#dedede",
        "neutral-5": "#c5c5c5",
        "neutral-6": "#969696",
        "neutral-7": "#6c6c6c",
        "neutral-8": "#454545",
        "neutral-9": "#252525",
        "neutral-10": "#000000"
      },
      "dark": {
        "neutral-1": "#000000",
        "neutral-2": "#202020",
        "neutral-3": "#2b2b2b",
        "neutral-4": "#383838",
        "neutral-5": "#505050",
        "neutral-6": "#777777",
        "neutral-7": "#a3a3a3",
        "neutral-8": "#c6c6c6",
        "neutral-9": "#e5e5e5",
        "neutral-10": "#ffffff"
      }
    },
    "keyColorPalette": [
      "#76ef6b",
      "#E0E709",
      "#00c9bb",
      "#009ff0",
      "#e864ff",
      "#262626",
      "#ffa344"
    ]
  },
  "componentTokens": {
    "switch:default:part:row:rest": {
      "gap": "s"
    },
    "switch:default:part:label:rest": {
      "textSize": "m"
    },
    "checkbox:default:part:label:rest": {
      "textSize": "m"
    },
    "switch:default:part:control:rest": {
      "controlSize": "xl"
    }
  },
  "componentVariants": {}
};

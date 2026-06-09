#!/usr/bin/env python3
"""Genera particulas custom (burst) para Floating Text Ultimate.
Todas usan el atlas vanilla textures/particle/particles, asi que NO requieren PNG propio
y se pueden invocar de forma fiable desde la Script API con dimension.spawnParticle().
Basadas en la estructura probada de rainbow.particle.json (addon original de Death_Aruban).
"""
import json, os

OUT = os.path.join(os.path.dirname(__file__), "FT_UltimateRP", "particles")

# id -> (gradiente {pos: "#aarrggbb"}, accel_y, initial_speed)
PARTS = {
    "rainbow": ({"0.0": "#ffff0000", "0.2": "#ffff9900", "0.4": "#ffffff00",
                 "0.6": "#ff00ff00", "0.8": "#ff0066ff", "1.0": "#ff9900ff"}, 1.0, 0.4),
    "fire":    ({"0.0": "#ffff3300", "0.4": "#ffff8800", "0.8": "#ffffdd33", "1.0": "#00ffffaa"}, 1.4, 0.3),
    "ice":     ({"0.0": "#ff66e0ff", "0.5": "#ffbff5ff", "1.0": "#ffffffff"}, 0.8, 0.3),
    "gold":    ({"0.0": "#ffffcc00", "0.5": "#ffffe680", "1.0": "#ffffffff"}, 1.0, 0.35),
    "love":    ({"0.0": "#ffff5fa2", "0.4": "#ffff9ec7", "0.8": "#ffff3860", "1.0": "#ffffffff"}, 0.9, 0.3),
    "ender":   ({"0.0": "#ff2d0a45", "0.4": "#ff7209b7", "0.8": "#ffb5179e", "1.0": "#ff4cc9f0"}, 1.0, 0.35),
    "toxic":   ({"0.0": "#ff2db300", "0.5": "#ff7bed5a", "1.0": "#ffd8ffcc"}, 1.1, 0.35),
    "galaxy":  ({"0.0": "#ff3a0ca3", "0.35": "#ff7209b7", "0.7": "#ff4cc9f0", "1.0": "#ffffffff"}, 1.0, 0.3),
    "emerald": ({"0.0": "#ff0b6e2d", "0.4": "#ff2ecc71", "0.75": "#ff7bed9f", "1.0": "#ffffffff"}, 1.0, 0.3),
    "ocean":   ({"0.0": "#ff0353a4", "0.5": "#ff48cae4", "1.0": "#ffffffff"}, 0.9, 0.3),
    "lava":    ({"0.0": "#ff8b0000", "0.5": "#ffff6600", "1.0": "#ffffcc33"}, 1.3, 0.25),
    "snow":    ({"0.0": "#ffffffff", "0.6": "#ffd6f0ff", "1.0": "#00ffffff"}, -0.6, 0.15),
}


def make(identifier, gradient, accel_y, speed):
    return {
        "format_version": "1.10.0",
        "particle_effect": {
            "description": {
                "identifier": "ft:" + identifier,
                "basic_render_parameters": {
                    "material": "particles_alpha",
                    "texture": "textures/particle/particles"
                }
            },
            "components": {
                "minecraft:emitter_rate_instant": {"num_particles": 7},
                "minecraft:emitter_lifetime_once": {"active_time": 0.5},
                "minecraft:emitter_shape_sphere": {
                    "radius": 0.45,
                    "direction": "outwards",
                    "surface_only": False
                },
                "minecraft:particle_lifetime_expression": {"max_lifetime": "math.random(0.5,0.9)"},
                "minecraft:particle_initial_speed": speed,
                "minecraft:particle_motion_dynamic": {
                    "linear_acceleration": [0, accel_y, 0],
                    "linear_drag_coefficient": 1.5
                },
                "minecraft:particle_appearance_billboard": {
                    "size": [0.07, 0.07],
                    "facing_camera_mode": "rotate_xyz",
                    "uv": {
                        "texture_width": 128,
                        "texture_height": 128,
                        "flipbook": {
                            "base_UV": [64, 96],
                            "size_UV": [8, 8],
                            "step_UV": [-8, 0],
                            "max_frame": 10,
                            "stretch_to_lifetime": True
                        }
                    }
                },
                "minecraft:particle_appearance_lighting": {},
                "minecraft:particle_appearance_tinting": {
                    "color": {
                        "interpolant": "variable.particle_age",
                        "gradient": gradient
                    }
                }
            }
        }
    }


def main():
    os.makedirs(OUT, exist_ok=True)
    for ident, (grad, ay, sp) in PARTS.items():
        path = os.path.join(OUT, "ft_%s.particle.json" % ident)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(make(ident, grad, ay, sp), f, indent=2)
    print("OK -> %d particulas custom en %s" % (len(PARTS), OUT))


if __name__ == "__main__":
    main()

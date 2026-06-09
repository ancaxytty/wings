// Floating Text+ — addon original de Death_Aruban (creditos preservados).
// Mejora v5.0.0 (uso personal): mas particulas, mas velocidades, animacion flotante.
// tick handler: corre cada tick via tick.json

//============================ PARTICULAS ============================
//Particle 1
execute @e[type=da:floating_text,scores={particle=1..1}] ~ ~ ~ particle minecraft:falling_border_dust_particle ^ ^1 ^2

//Particle 2
execute @e[type=da:floating_text,scores={particle=2..2}] ~ ~ ~ particle minecraft:falling_dust_red_sand_particle ^ ^1 ^2

//Particle 3
execute @e[type=da:floating_text,scores={particle=3..3}] ~ ~ ~ particle minecraft:falling_dust_sand_particle ^ ^1 ^2

//Particle 4
execute @e[type=da:floating_text,scores={particle=4..4}] ~ ~ ~ particle minecraft:falling_dust_gravel_particle ^ ^1 ^2

//Particle 5
execute @e[type=da:floating_text,scores={particle=5..5}] ~ ~ ~ particle minecraft:falling_dust_top_snow_particle ^ ^1 ^2

//Particle 6
execute @e[type=da:floating_text,scores={particle=6..6}] ~ ~ ~ particle minecraft:falling_dust_dragon_egg_particle ^ ^1 ^2

//Particle 7
execute @e[type=da:floating_text,scores={particle=7..7}] ~ ~ ~ particle minecraft:villager_happy ^ ^1 ^2

//Particle 8
execute @e[type=da:floating_text,scores={particle=8..8}] ~ ~ ~ particle minecraft:falling_dust_scaffolding_particle ^ ^1 ^2

//Particle 9
execute @e[type=da:floating_text,scores={particle=9..9}] ~ ~ ~ particle minecraft:mob_portal ^ ^1 ^2

//Particle 10
execute @e[type=da:floating_text,scores={particle=10..10}] ~ ~ ~ particle minecraft:blue_flame_particle ^ ^1 ^2

//Particle 11
execute @e[type=da:floating_text,scores={particle=11..11}] ~ ~ ~ particle itaflag ^ ^1 ^2

//Particle 12
execute @e[type=da:floating_text,scores={particle=12..12}] ~ ~ ~ particle rainbow ^ ^1 ^2

//Particle 13 — NEW custom: Galaxia
execute @e[type=da:floating_text,scores={particle=13..13}] ~ ~ ~ particle da_galaxy ~ ~1 ~

//Particle 14 — NEW custom: Esmeralda
execute @e[type=da:floating_text,scores={particle=14..14}] ~ ~ ~ particle da_emerald ~ ~1 ~

//Particle 15 — NEW: Corazones
execute @e[type=da:floating_text,scores={particle=15..15}] ~ ~ ~ particle minecraft:heart_particle ^ ^1 ^2

//Particle 16 — NEW: Totem
execute @e[type=da:floating_text,scores={particle=16..16}] ~ ~ ~ particle minecraft:totem_particle ^ ^1 ^2

//Particle 17 — NEW: Fuego
execute @e[type=da:floating_text,scores={particle=17..17}] ~ ~ ~ particle minecraft:basic_flame_particle ^ ^1 ^2

//Particle 18 — NEW: Critico
execute @e[type=da:floating_text,scores={particle=18..18}] ~ ~ ~ particle minecraft:basic_crit_particle ^ ^1 ^2

//Particle 19 — NEW: Humo
execute @e[type=da:floating_text,scores={particle=19..19}] ~ ~ ~ particle minecraft:basic_smoke_particle ^ ^1 ^2

//Particle 20 — NEW: Agua
execute @e[type=da:floating_text,scores={particle=20..20}] ~ ~ ~ particle minecraft:water_splash_particle ^ ^1 ^2

//============================ VELOCIDAD / ROTACION ============================
//Speed x1 (lenta)
execute @e[type=da:floating_text,scores={speed=1}] ~ ~ ~ tp @s ~ ~ ~ ~-5
//Speed x2 (media)
execute @e[type=da:floating_text,scores={speed=2}] ~ ~ ~ tp @s ~ ~ ~ ~-10
//Speed x3 (rapida)
execute @e[type=da:floating_text,scores={speed=3}] ~ ~ ~ tp @s ~ ~ ~ ~-20
//Speed x4 (turbo) — NEW
execute @e[type=da:floating_text,scores={speed=4}] ~ ~ ~ tp @s ~ ~ ~ ~-40
//Speed x5 (reversa) — NEW
execute @e[type=da:floating_text,scores={speed=5}] ~ ~ ~ tp @s ~ ~ ~ ~8

//============================ ANIMACION FLOTANTE (BOB) — NEW ============================
scoreboard players add @e[type=da:floating_text,tag=bob] bob 1
execute @e[type=da:floating_text,tag=bob,scores={bob=1..25}] ~ ~ ~ tp @s ~ ~0.012 ~
execute @e[type=da:floating_text,tag=bob,scores={bob=26..50}] ~ ~ ~ tp @s ~ ~-0.012 ~
execute @e[type=da:floating_text,tag=bob,scores={bob=50..}] ~ ~ ~ scoreboard players set @s bob 0

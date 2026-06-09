scoreboard objectives add bob dummy
tag @e[type=da:floating_text,tag=edit] add bob
scoreboard players set @e[type=da:floating_text,tag=edit] bob 0
playsound lodestone_compass.link_compass_to_lodestone @s ~ ~ ~
titleraw @s actionbar {"rawtext":[{"text":"§l§7[§6Floating §bText§7]§r §a\n§a↑↓ Float motion §2ON"}]}

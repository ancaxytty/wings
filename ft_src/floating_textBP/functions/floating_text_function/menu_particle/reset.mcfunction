scoreboard players set @e[type=da:floating_text,tag=edit] speed 0
scoreboard players set @e[type=da:floating_text,tag=edit] particle 0
tag @e[type=da:floating_text,tag=edit] remove bob
playsound lodestone_compass.link_compass_to_lodestone @s ~ ~ ~
titleraw @s[tag=menu_edit4] actionbar  {"rawtext":[{"text":"§l§7[§6Floating §bText§7]§r §a\n §aParticle, Speed & Float §cReset"}]}

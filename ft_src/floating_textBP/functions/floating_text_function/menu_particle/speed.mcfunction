scoreboard players add @e[type=da:floating_text,tag=edit] speed 1
playsound lodestone_compass.link_compass_to_lodestone @s ~ ~ ~
execute @e[type=da:floating_text,tag=edit,scores={speed=6}] ~ ~ ~ scoreboard players set @e[type=da:floating_text,scores={speed=6}] speed 0
titleraw @s actionbar {"rawtext":[{"text":"§l§7[§6Floating §bText§7]§r §a\n§eVelocidad / Speed: §f0=Off 1-4=Giro 5=Reversa"}]}

scoreboard players add @e[type=da:floating_text,tag=edit] particle 1
playsound lodestone_compass.link_compass_to_lodestone @s ~ ~ ~
execute @e[type=da:floating_text,tag=edit,scores={particle=21}] ~ ~ ~ scoreboard players set @e[type=da:floating_text,scores={particle=21}] particle 0

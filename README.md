# nakatori-extension
An extension for CoC7e




## Console commands:

#### Get curse of all actors
```
game.actors.contents.map(a => ({
  name: a.name,
  curse: a.getFlag("nakatori-extension", "curse.value")
}))
```
#### Get prowess of all actors
```
game.actors.contents.map(a => ({
  name: a.name,
  ProwessMax: a.getFlag("nakatori-extension", "prowess.max"),
  ProwessUsed: a.getFlag("nakatori-extension", "prowess.used")
}))
```
#### Get hp of all actors
```
game.actors.contents.map(a => ({
  name: a.name,
  hp: a.system.attribs.hp.value,
  hpMax: a.system.attribs.hp.max
}))
```
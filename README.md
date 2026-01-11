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
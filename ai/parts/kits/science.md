### Science diagrams (physics, chemistry, biology)

Describe the situation in plain words and numbers; the builder draws the diagram. Every block is a numbered figure that takes `caption`, `id`, `source`, `width`, `align` and `wrap`. Options go on the first lines, then (optionally after a line of `---`) the content lines. Units can be typed as `kJ mol^-1` or `cm^{3}`; `ohm` becomes the omega sign.

**Circuit** `:::circuit`: a single loop. `battery: 6 V` (or `cell: 1.5 V`), then `series:` lines listing components in order, and `parallel:` lines whose branches are separated by commas (join several components in one branch with `+`). Components: `resistor`, `variable resistor`, `bulb` (or `lamp`), `switch` (add `open` or `closed`), `ammeter`, `voltmeter`, `capacitor`, `cell`, `diode`, `motor`. A component may have a name and a value: `resistor R1 10 ohm`. `voltmeter: across R1` (a name, a component kind such as `bulb`, or `parallel` for the whole parallel block) draws a voltmeter in parallel with it.

```
:::circuit
caption: Two resistors in parallel.
battery: 12 V
series: switch
parallel: resistor R1 10 ohm, resistor R2 20 ohm
voltmeter: across parallel
:::
```

**Free-body diagram** `:::fbd`: one force per line as `Name: size direction`. The direction is `up`, `down`, `left`, `right` or `at 60°` (counter-clockwise from the right). Arrows are drawn in proportion to the sizes, and the resultant is worked out in a panel at the right. Options: `object: box` or `dot`, `resultant: no`, `scale: no` (equal arrow lengths). The resultant panel appears when every force has a size; a force without one (`Tension: at 60°`) is drawn at a standard length.

```
:::fbd
caption: Forces on a pushed box.
---
Weight: 49 N down
Normal: 49 N up
Applied: 20 N right
Friction: 8 N left
:::
```

**Wave** `:::wave`: `wavelength: 4 m`, `amplitude: 2 cm`, `period: 0.5 s` (all optional; a missing value just shows the symbol). `kind: time` draws displacement against time and marks the period, otherwise displacement against distance marks the wavelength. `cycles:` sets how many waves (default 2).

```
:::wave
caption: A transverse wave.
wavelength: 4 m
amplitude: 2 cm
:::
```

**Inclined plane** `:::incline`: `angle: 30`, optional `mass: 5 kg`, `forces:` (any of `weight`, `normal`, `friction`, `push`; default the first three), `friction: down` (default up the slope), `components: yes` (weight split along and across the slope), `object: ball`, `g:` (default 9.81). With a mass, the forces are labelled with their values.

```
:::incline
caption: A block on a slope.
angle: 30
mass: 5 kg
components: yes
:::
```

**Projectile** `:::projectile`: `speed: 20 m/s`, `angle: 40`, `height: 5` (launch height in metres, default 0), `g:`. The path is computed. `show:` lists what to mark: `range`, `height`, `components`, `time` (default range, height, components). Without a speed the diagram is symbolic.

```
:::projectile
caption: A ball thrown from a wall.
speed: 20 m/s
angle: 40
height: 5
show: range height components time
:::
```

**Reaction energy profile** `:::energyprofile`: `activation energy: 50 kJ mol^-1` (or `Ea`), `delta H: -120 kJ mol^-1` (or `dH`; negative is exothermic), optional `catalysed: 30` (activation energy with a catalyst, drawn dashed), `reactants: A + B`, `products: C`, `transition state: yes`. Heights are drawn to scale.

```
:::energyprofile
caption: An exothermic reaction with a catalyst.
activation energy: 50 kJ mol^-1
delta H: -120 kJ mol^-1
catalysed: 30
reactants: A + B
products: C
:::
```

**Titration curve** `:::titration`: `type:` as two phrases, the flask first and the burette second, such as `weak acid with strong base` or `strong base with strong acid` (the burette liquid must be strong). The curve is calculated. Options: `volume` (in the flask, default 25), `concentration` (default 0.1), `equivalence` (volume at the equivalence point, default the same as the flask volume), `pKa` or `pKb` (weak cases), `indicator` (a name such as `phenolphthalein`, `methyl orange`, `methyl red`, `bromothymol blue`, or a range such as `thymol blue 8 to 9.6`), `half: no`, `xmax`.

```
:::titration
caption: Ethanoic acid titrated with sodium hydroxide.
type: weak acid with strong base
indicator: phenolphthalein
:::
```

**Punnett square** `:::punnett`: `cross: Tt x Tt` (one gene) or `cross: RrYy x RrYy` (two genes); `traits:` names the phenotypes as `T = tall, t = short` (uppercase letter is the dominant trait). The genotype and phenotype ratios are worked out below the square. Option `ratios: no` hides them. Complete dominance only.

```
:::punnett
caption: A dihybrid cross.
cross: RrYy x RrYy
traits: R = round, r = wrinkled, Y = yellow, y = green
:::
```

**Pedigree** `:::pedigree`: one line per person or couple, children indented under their parents. A person is `Name (male, affected)`; words in the brackets: `male`, `female`, `affected` (filled), `carrier` (dot), `deceased` (slash). A couple is `Ann (female) + Bob (male)`. Generations are numbered I, II, III and a key is added. Option `legend: no`.

```
:::pedigree
caption: A family with an inherited condition.
---
Ann (female, carrier) + Bob (male)
  Cara (female, affected)
  Dan (male)
  Eve (female, carrier) + Frank (male, affected)
    Gus (male, affected)
:::
```

**Pyramid** `:::pyramid`: one level per line as `Name: value`, producers first. Bar widths follow the values. Options: `unit: kJ m^-2 yr^-1`, `shape: triangle` (a classic pyramid instead of bars), `scale: sqrt` or `log` (for very different values), `efficiency: yes` (percentage passed on to the next level), `order: top` (list the top level first).

```
:::pyramid
caption: Energy in a food chain.
unit: kJ m^-2 yr^-1
efficiency: yes
---
Producers: 20000
Primary consumers: 3000
Secondary consumers: 300
Tertiary consumers: 30
:::
```

**Food web** `:::foodweb`: arrows point in the direction of energy flow, from the organism eaten to the one that eats it: `Grass -> Rabbit, Mouse`, `Rabbit -> Fox -> Hawk`. Sentences also work: `Fox eats Rabbit, Mouse` and `Rabbit is eaten by Fox`. Producers sit at the bottom and each row above is the next trophic level.

```
:::foodweb
caption: A grassland food web.
---
Grass -> Rabbit, Grasshopper, Mouse
Rabbit -> Fox
Grasshopper -> Frog
Frog -> Snake
Snake -> Hawk
Fox -> Hawk
Mouse -> Snake, Owl
:::
```

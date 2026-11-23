### Computer science tools

**Truth table** `:::truth`: write a Boolean expression and the table is generated (up to 6 inputs). Use `AND OR NOT XOR NAND NOR XNOR IMPLIES`, or `& | ! ^`, brackets allowed. `steps: yes` adds a column for each sub-expression, `values: tf` uses T and F, `Q = A XOR B` names an output, and several lines give several output columns. It is a numbered table (`caption`, `id`, `style`).

```
:::truth
caption: Access rule.
steps: yes
---
(A AND B) OR NOT C
:::
```

**Pseudocode** `:::pseudocode`: an algorithm in a numbered card with bold keywords (`IF THEN ELSE END IF WHILE FOR LOOP OUTPUT INPUT RETURN ...`). `<-` or `:=` becomes ←, `<=` becomes ≤, `//` starts a comment. Indentation is kept. Options: `numbers: no`, `caption`, `id`.

```
:::pseudocode
caption: Linear search.
---
found <- false
i <- 0
WHILE i < LENGTH(list) AND found = false
    IF list[i] = target THEN
        found <- true
    END IF
    i <- i + 1
END WHILE
OUTPUT found
:::
```

### Software diagrams (UML, ER, states, sequences)

Write the diagram in plain words; the builder lays it out. All four are numbered figures that take `caption`, `id`, `source`, `width`, `align`, `wrap` and `direction` (`TB` or `LR`).

**Class diagram** `:::uml`: a line `class Name` followed by indented members (`+` public, `-` private, `#` protected; methods have brackets), then the relationships as plain sentences.

```
:::uml
caption: Library classes.
---
class Person <<abstract>>
  - name: String
  + getName(): String
class Member
  + borrow(book: Book): void
class Book
  - title: String
Member extends Person
Member has many Book
Library composed of Book
Dog implements Pet
Order uses Printer
Teacher -> Course : teaches
:::
```

Relationship words: `extends`, `inherits from`, `is a` (inheritance); `implements` (realisation); `composed of`, `contains` (composition); `aggregates` (aggregation); `uses`, `depends on` (dependency); `has many`, `has one`; `A -> B : label` (association). Mermaid arrows such as `--|>` and `*--` also work.

**ER diagram** `:::erd`: entities as `Name: attribute, attribute` (add `PK`, `FK`, `UNIQUE`, or a type with `name: type`), links as `Customer one -- many Order : places`. Cardinality words: `one`, `many`, `zero or one`, `zero or many`, `one or many` (also `1`, `N`, `0..1`, `1..*`).

```
:::erd
caption: Shop database.
---
Customer: id PK, name, email UNIQUE
Order: id PK, order_date: date, customer_id FK
Customer one -- many Order : places
:::
```

**State diagram** `:::fsm` (also `:::statemachine`): `State -> State : event`; `Start` and `End` are the start and end markers.

```
:::fsm
Start -> Red
Red -> Green : timer
Green -> Red : timer
:::
```

**Sequence diagram** `:::seq` (also `:::interaction`): `Alice -> Bob: message` (solid), `Bob --> Alice: reply` (dashed), `note over Alice: text`, and `loop`/`alt`/`opt`/`else`/`end` lines.

```
:::seq
User -> Website: Enter password
Website --> User: Show account
:::
```

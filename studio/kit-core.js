registerKit({
  group: 'Software',
  kinds: [
    {
      kind: 'uml',
      label: 'Class diagram',
      icon: 'diagram',
      bodyTitle: 'Classes',
      hint: 'class Animal\n  - name: String\n  + speak(): void\nclass Dog\nDog extends Animal',
      options: [{ key: 'direction', label: 'Direction', type: 'choice', choices: [['', 'Auto'], ['TB', 'Top down'], ['LR', 'Left to right']] }],
      template: [':::uml', 'caption: Class diagram.', '---', 'class Animal', '  - name: String', '  + speak(): void', 'class Dog', '  + fetch(): void', 'Dog extends Animal', ':::'],
    },
    {
      kind: 'erd',
      label: 'ER diagram',
      icon: 'table',
      bodyTitle: 'Entities and links',
      hint: 'Customer: id PK, name, email\nOrder: id PK, customer_id FK\nCustomer one -- many Order : places',
      template: [':::erd', 'caption: Entity relationship diagram.', '---', 'Customer: id PK, name, email', 'Order: id PK, order_date: date, customer_id FK', 'Customer one -- many Order : places', ':::'],
    },
    {
      kind: 'fsm',
      label: 'State diagram',
      icon: 'diagram',
      bodyTitle: 'Transitions',
      hint: 'Start -> Idle\nIdle -> Running : start\nRunning -> Idle : stop',
      template: [':::fsm', 'caption: State diagram.', '---', 'Start -> Red', 'Red -> Green : timer', 'Green -> Yellow : timer', 'Yellow -> Red : timer', ':::'],
    },
    {
      kind: 'seq',
      label: 'Sequence diagram',
      icon: 'timeline',
      bodyTitle: 'Messages',
      hint: 'Alice -> Bob: Hello\nBob --> Alice: Reply',
      template: [':::seq', 'caption: Sequence diagram.', '---', 'User -> Website: Enter password', 'Website -> Database: Check credentials', 'Database --> Website: Valid', 'Website --> User: Show account', ':::'],
    },
  ],
});

registerKit({
  group: 'Computer science',
  kinds: [
    {
      kind: 'truth',
      label: 'Truth table',
      icon: 'table',
      bodyTitle: 'Expression',
      hint: '(A AND B) OR NOT C',
      options: [
        { key: 'steps', label: 'Show working columns', type: 'switch' },
        { key: 'values', label: 'Values', type: 'choice', choices: [['', '1 and 0'], ['tf', 'T and F']] },
      ],
      template: [':::truth', 'caption: Truth table.', 'steps: yes', '---', '(A AND B) OR NOT C', ':::'],
    },
    {
      kind: 'pseudocode',
      label: 'Pseudocode',
      icon: 'code',
      bodyTitle: 'Algorithm',
      hint: 'total <- 0\nFOR i <- 1 TO 10\n    total <- total + i\nEND FOR\nOUTPUT total',
      options: [{ key: 'numbers', label: 'Line numbers', type: 'switch', value: 'yes' }],
      layout: false,
      template: [':::pseudocode', 'caption: Algorithm.', '---', 'total <- 0', 'FOR i <- 1 TO 10', '    total <- total + i', 'END FOR', 'OUTPUT total', ':::'],
    },
  ],
});

registerKit({
  group: 'Documents',
  kinds: [
    {
      kind: 'sources',
      label: 'Sources',
      icon: 'list',
      bodyTitle: 'Your sources',
      options: [{ key: 'citations', label: 'Citation style', type: 'header', value: 'apa', choices: [['apa', 'APA'], ['mla', 'MLA'], ['harvard', 'Harvard'], ['chicago', 'Chicago'], ['ieee', 'IEEE']] }],
      hint: '@smith2020\ntype: book\nauthor: Smith, John\nyear: 2020\ntitle: Title of the book\npublisher: Publisher',
      layout: false,
      caption: false,
      template: [':::sources', '@smith2020', 'type: book', 'author: Smith, John', 'year: 2020', 'title: Title of the book', 'publisher: Publisher', 'city: London', ':::'],
    },
    {
      kind: 'bibliography',
      label: 'Reference list',
      icon: 'paragraph',
      hasBody: false,
      layout: false,
      caption: false,
      options: [{ key: 'citations', label: 'Citation style', type: 'header', value: 'apa', choices: [['apa', 'APA'], ['mla', 'MLA'], ['harvard', 'Harvard'], ['chicago', 'Chicago'], ['ieee', 'IEEE']] }, { key: 'all', label: 'List every source', type: 'switch' }],
      template: [':::bibliography', ':::'],
    },
  ],
});

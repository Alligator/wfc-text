const fs = require('fs/promises');

class WFC {
  constructor(input, length) {
    const words = input
      .toLowerCase()
      .trim()
      .replace(/\n/g, ' ')
      .replace(/ +/g, ' ')
      .split(/ /g);
    this.findPatterns(words);
    this.fillParagraph(length);
    this.allCollapsed = false;
    this.lastCollapse = 0;
    this.contradictionCount = 0;
  }

  done() {
    return this.allCollapsed;
  }

  findPatterns(input) {
    const words = [];
    const frequencies = [];
    const wordIndex = new Map();

    for (let i = 0; i < input.length; i++) {
      if (!wordIndex.has(input[i])) {
        words.push(input[i]);
        wordIndex.set(input[i], words.length - 1);
      }
      const index = wordIndex.get(input[i]);
      frequencies[index] = frequencies[index] || 0;
      frequencies[index]++;
    }

    // find the patterns
    const lpatterns = new Map();
    const rpatterns = new Map();
    const seenPatterns = new Set();
    for (let i = 0; i < input.length - 1; i++) {
      const p1 = input[i];
      const p2 = input[i + 1];
      const patStr = JSON.stringify([p1, p2]); // ugh

      if (!seenPatterns.has(patStr)) {
        const w1 = wordIndex.get(p1);
        const w2 = wordIndex.get(p2);

        if (!lpatterns.has(w2)) {
          lpatterns.set(w2, [w1]);
        } else {
          lpatterns.set(w2, [...lpatterns.get(w2), w1]);
        }

        if (!rpatterns.has(w1)) {
          rpatterns.set(w1, [w2]);
        } else {
          rpatterns.set(w1, [...lpatterns.get(w1), w2]);
        }

        seenPatterns.add(patStr);
      }
    }

    // normalize frequencies
    this.frequencies = frequencies.map(f => f / input.length);
    this.mostCommonWords = [];
    let maxFreq = Math.max.apply(Math, this.frequencies);
    for (let i = 0; i < this.frequencies.length; i++) {
      if (this.frequencies[i] === maxFreq) {
        this.mostCommonWords.push(i);
      }
    }

    words[-1] = '???';
    this.words = words;
    this.lpatterns = lpatterns;
    this.rpatterns = rpatterns;
  }

  fillParagraph(length) {
    this.paragraph = [];
    for (let i = 0; i < length; i++) {
      this.paragraph.push(new Array(this.words.length).fill(0).map((_, index) => index));
    }
  }

  entropy(p) {
    let sum = 0;
    for (const w of p) {
      const freq = this.frequencies[w];
      sum -= freq/p.length * Math.log2(freq/p.length);
    }
    return sum;
  }

  observe() {
    let minEntropy = Infinity;
    let wordIndex = null;

    for (let i = 0; i < this.paragraph.length; i++) {
      const word = this.paragraph[i];
      if (word.length === 1) {
        continue;
      }

      const entropy = this.entropy(word);
      if (entropy < minEntropy) {
        minEntropy = entropy;
        wordIndex = i;
      }
    }

    if (wordIndex === null) {
      this.allCollapsed = true;
      return;
    }

    // weighted random, take 2
    const word = this.paragraph[wordIndex];
    const wordFreqSum = word.reduce((acc, i) => acc + this.frequencies[i], 0);

    let r = Math.random() * wordFreqSum;
    let acc = 0;
    let choice = word[0];

    for (const w of word) {
      const freq = this.frequencies[w];
      acc += freq;
      if (acc >= r) {
        choice = w;
        break;
      }
    }

    this.lastCollapse = wordIndex;
    this.paragraph[wordIndex] = [choice];
    this.propagate(wordIndex);
  }

  handleContraction(i) {
    // uh oh, a contradiction!
    // collapse it to one of the most common words
    this.contradictionCount++;
    this.paragraph[i] = [this.mostCommonWords[Math.floor(Math.random() * this.mostCommonWords.length)]];
  }

  propagate(i) {
    const stack = [i];
    while (stack.length) {
      const index = stack.pop();
      const word = this.paragraph[index];

      // left neighbour
      const leftIndex = index - 1;
      if (index > 0 && this.paragraph[leftIndex].length > 1) {
        const originalLength = this.paragraph[leftIndex].length;
        const validLeftNeighbours = new Set();
        for (const w of word) {
          if (this.lpatterns.has(w)) {
            this.lpatterns.get(w).forEach(p => validLeftNeighbours.add(p));
          }
        }

        this.paragraph[leftIndex] = this.paragraph[leftIndex]
          .filter(word => validLeftNeighbours.has(word));
        
        if (this.paragraph[leftIndex].length === 0) {
          this.handleContraction(leftIndex);
        }

        if (originalLength !== this.paragraph[leftIndex].length) {
          stack.push(leftIndex);
        }
      }

      // right neighbour
      const rightIndex = index + 1;
      if (index < this.paragraph.length - 1 && this.paragraph[rightIndex].length > 1) {
        const originalLength = this.paragraph[rightIndex].length;
        const validRightNeighbours = new Set();
        for (const w of word) {
          if (this.rpatterns.has(w)) {
            this.rpatterns.get(w).forEach(p => validRightNeighbours.add(p));
          }
        }

        this.paragraph[rightIndex] = this.paragraph[rightIndex]
          .filter(word => validRightNeighbours.has(word));

        if (this.paragraph[rightIndex].length === 0) {
          this.handleContraction(rightIndex);
        }

        if (originalLength !== this.paragraph[rightIndex].length) {
          stack.push(rightIndex);
        }
      }
    }
  }

  makePrintable(w) {
    switch (w) {
      case '\n':
        return '\\n';
      case '\r':
        return '\\r';
      case '\t':
        return '\\t';
      default:
        return w;
    }
  }

  progress() {
    const words = [];
    for (let i = 0; i < this.paragraph.length; i++) {
      const w = this.paragraph[i];
      if (w.length === 1) {
        if (this.lastCollapse === i) {
          words.push(`\x1b[92m${this.makePrintable(this.words[w[0]])}\x1b[0m`);
        } else {
          words.push(this.makePrintable(this.words[w[0]]));
        }
      } else {
        let highestFreqWord = 0;
        let highestFreq = 0;
        for (const i of w) {
          if (this.frequencies[i] > highestFreq) {
            highestFreq = this.frequencies[i];
            highestFreqWord = i;
          }
        }
        words.push(`\x1b[90m${this.makePrintable(this.words[highestFreqWord])}\x1b[0m`);
      }
    }
    return words.join(' ');
  }

  string() {
    const words = [];
    for (const w of this.paragraph) {
      words.push(this.words[w[0]]);
    }
    return words.join(' ');
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function go(wordCount, file, showVisulisation) {
  const input = await fs.readFile(file, { encoding: 'utf-8' });
  const wfc = new WFC(input, wordCount);
  while (!wfc.done()) {
    if (showVisulisation) {
      process.stderr.write('\x1b[1J\x1b[1;1H');
      process.stderr.write(wfc.progress());
      process.stderr.write(`\ncontractions: ${wfc.contradictionCount}\n`);
    }
    wfc.observe();
    if (showVisulisation) {
      await sleep(100);
    }
  }
  if (showVisulisation) {
    process.stderr.write('\x1b[1J\x1b[1;1H');
    process.stderr.write(wfc.progress());
    process.stderr.write('\x1b[1J\x1b[1;1H');
  }
  console.log(wfc.string());
}

function usage() {
  console.log('usage node wfc-text.js [-v] word_count file');
  process.exit(0);
}

let showVisulisation = false;
let args = [];
for (const arg of process.argv.slice(2)) {
  switch (arg) {
    case '-v':
      showVisulisation = true;
      break;
    case '-h':
      usage();
      break;
    default:
      args.push(arg);
  }
}

if (args.length !== 2) {
  usage();
}

const wordCount = parseInt(args[0], 10);
if (isNaN(wordCount)) {
  usage();
}

const file = args[1];
go(wordCount, file, showVisulisation);
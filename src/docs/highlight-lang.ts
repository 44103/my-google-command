interface HighlightRule {
  pattern: RegExp;
  color: string;
  priority: number; // higher = applied first, wins on overlap
}

interface LanguageDefinition {
  name: string;
  aliases: string[];
  rules: HighlightRule[];
}

// --- Colors (One Dark inspired) ---
const C = {
  comment: "#7F848E",
  string: "#98C379",
  keyword: "#C678DD",
  builtin: "#61AFEF",
  number: "#D19A66",
  operator: "#56B6C2",
};

// --- Language definitions ---

const langJavaScript: LanguageDefinition = {
  name: "javascript",
  aliases: ["js", "javascript", "ts", "typescript", "jsx", "tsx"],
  rules: [
    { pattern: /\/\/.*$/gm, color: C.comment, priority: 10 },
    { pattern: /\/\*[\s\S]*?\*\//g, color: C.comment, priority: 10 },
    { pattern: /`(?:[^`\\]|\\.)*`/g, color: C.string, priority: 9 },
    { pattern: /"(?:[^"\\]|\\.)*"/g, color: C.string, priority: 9 },
    { pattern: /'(?:[^'\\]|\\.)*'/g, color: C.string, priority: 9 },
    { pattern: /\b\d+(?:\.\d+)?\b/g, color: C.number, priority: 5 },
    { pattern: /\b(?:const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|import|export|from|default|try|catch|finally|throw|async|await|yield|of|in|typeof|instanceof|void|delete|interface|type|enum|implements|declare|readonly|as|is|keyof|namespace|abstract|static|public|private|protected)\b/g, color: C.keyword, priority: 3 },
    { pattern: /\b(?:console|Math|Object|Array|String|Number|Boolean|Promise|Map|Set|RegExp|JSON|Date|Error|undefined|null|true|false|NaN|Infinity)\b/g, color: C.builtin, priority: 2 },
  ],
};

const langPython: LanguageDefinition = {
  name: "python",
  aliases: ["python", "py"],
  rules: [
    { pattern: /#.*$/gm, color: C.comment, priority: 10 },
    { pattern: /"""[\s\S]*?"""/g, color: C.string, priority: 9 },
    { pattern: /'''[\s\S]*?'''/g, color: C.string, priority: 9 },
    { pattern: /"(?:[^"\\]|\\.)*"/g, color: C.string, priority: 9 },
    { pattern: /'(?:[^'\\]|\\.)*'/g, color: C.string, priority: 9 },
    { pattern: /\b\d+(?:\.\d+)?\b/g, color: C.number, priority: 5 },
    { pattern: /\b(?:def|class|return|if|elif|else|for|while|break|continue|pass|import|from|as|try|except|finally|raise|with|yield|lambda|and|or|not|in|is|global|nonlocal|assert|del|async|await)\b/g, color: C.keyword, priority: 3 },
    { pattern: /\b(?:print|len|range|int|str|float|list|dict|set|tuple|bool|None|True|False|self|super|type|isinstance|enumerate|zip|map|filter|open|input)\b/g, color: C.builtin, priority: 2 },
  ],
};

const langBash: LanguageDefinition = {
  name: "bash",
  aliases: ["bash", "sh", "shell", "zsh"],
  rules: [
    { pattern: /#.*$/gm, color: C.comment, priority: 10 },
    { pattern: /"(?:[^"\\]|\\.)*"/g, color: C.string, priority: 9 },
    { pattern: /'[^']*'/g, color: C.string, priority: 9 },
    { pattern: /\b\d+\b/g, color: C.number, priority: 5 },
    { pattern: /\b(?:if|then|else|elif|fi|for|while|do|done|case|esac|in|function|return|local|export|source|exit|break|continue|set|unset|readonly|declare|typeset|shift|trap|eval|exec)\b/g, color: C.keyword, priority: 3 },
    { pattern: /\b(?:echo|cd|ls|cat|grep|sed|awk|find|xargs|curl|jq|mkdir|rm|cp|mv|chmod|chown|test|read|printf|wc|sort|uniq|head|tail|tee|tr|cut|dirname|basename)\b/g, color: C.builtin, priority: 2 },
  ],
};

const langRuby: LanguageDefinition = {
  name: "ruby",
  aliases: ["ruby", "rb"],
  rules: [
    { pattern: /#.*$/gm, color: C.comment, priority: 10 },
    { pattern: /=begin[\s\S]*?=end/g, color: C.comment, priority: 10 },
    { pattern: /"(?:[^"\\]|\\.)*"/g, color: C.string, priority: 9 },
    { pattern: /'(?:[^'\\]|\\.)*'/g, color: C.string, priority: 9 },
    { pattern: /\b\d+(?:\.\d+)?\b/g, color: C.number, priority: 5 },
    { pattern: /\b(?:def|class|module|end|if|elsif|else|unless|for|while|until|do|begin|rescue|ensure|raise|return|yield|block_given\?|require|require_relative|include|extend|attr_accessor|attr_reader|attr_writer|public|private|protected|super|self|then|case|when)\b/g, color: C.keyword, priority: 3 },
    { pattern: /\b(?:puts|print|p|gets|nil|true|false|Array|Hash|String|Integer|Float|Symbol|Proc|Lambda)\b/g, color: C.builtin, priority: 2 },
  ],
};

const langGo: LanguageDefinition = {
  name: "go",
  aliases: ["go", "golang"],
  rules: [
    { pattern: /\/\/.*$/gm, color: C.comment, priority: 10 },
    { pattern: /\/\*[\s\S]*?\*\//g, color: C.comment, priority: 10 },
    { pattern: /`[^`]*`/g, color: C.string, priority: 9 },
    { pattern: /"(?:[^"\\]|\\.)*"/g, color: C.string, priority: 9 },
    { pattern: /\b\d+(?:\.\d+)?\b/g, color: C.number, priority: 5 },
    { pattern: /\b(?:package|import|func|return|if|else|for|range|switch|case|default|break|continue|go|defer|select|chan|map|struct|interface|type|const|var|fallthrough|goto)\b/g, color: C.keyword, priority: 3 },
    { pattern: /\b(?:fmt|len|cap|make|new|append|copy|delete|close|panic|recover|print|println|error|nil|true|false|iota|string|int|int8|int16|int32|int64|uint|uint8|uint16|uint32|uint64|float32|float64|bool|byte|rune|any)\b/g, color: C.builtin, priority: 2 },
  ],
};

// --- Registry ---

const _highlightLanguages: LanguageDefinition[] = [
  langJavaScript,
  langPython,
  langBash,
  langRuby,
  langGo,
];

function findLanguage(lang: string): LanguageDefinition | null {
  if (!lang) return null;
  const l = lang.toLowerCase();
  return _highlightLanguages.find(d => d.name === l || d.aliases.includes(l)) || null;
}

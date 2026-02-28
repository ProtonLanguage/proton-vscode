const vscode = require('vscode');

// All built-in Proton keywords and functions (correct casing)
const KEYWORDS = [
  'var', 'var:local', 'const', 'const:local', 'func', 'module',
  'if', 'else', 'while', 'for', 'each', 'in', 'to', 'do', 'end',
  'return', 'break', 'continue', 'try', 'catch', 'throw',
  'and', 'or', 'not', 'true', 'false', 'null',
  'int', 'float', 'string', 'bool', 'array', 'table',
  'math.huge'
];

const BUILTINS = [
  'print', 'typeof', 'tostring', 'toint', 'tofloat',
  'len', 'wait', 'random'
];

const DATASTORE = [
  'datastore.save', 'datastore.load',
  'datastore.exists', 'datastore.delete'
];

// Autocomplete provider
const completionProvider = vscode.languages.registerCompletionItemProvider(
  { language: 'proton', scheme: 'file' },
  {
    provideCompletionItems(document, position) {
      const items = [];

      // Keywords
      KEYWORDS.forEach(kw => {
        const item = new vscode.CompletionItem(kw, vscode.CompletionItemKind.Keyword);
        item.detail = 'Proton keyword';
        items.push(item);
      });

      // Built-in functions
      BUILTINS.forEach(fn => {
        const item = new vscode.CompletionItem(fn, vscode.CompletionItemKind.Function);
        item.detail = 'Built-in function';
        item.insertText = new vscode.SnippetString(fn + '($1)');
        items.push(item);
      });

      // Datastore functions
      DATASTORE.forEach(fn => {
        const item = new vscode.CompletionItem(fn, vscode.CompletionItemKind.Function);
        item.detail = 'Datastore (Lua backend)';
        item.insertText = new vscode.SnippetString(fn + '($1)');
        items.push(item);
      });

      return items;
    }
  }
);

// Diagnostic provider — checks for case errors and common mistakes
const diagnosticCollection = vscode.languages.createDiagnosticCollection('proton');

function validateDocument(document) {
  if (document.languageId !== 'proton') return;

  const diagnostics = [];
  const text = document.getText();
  const lines = text.split('\n');

  // Track module variables declared in this file
  const moduleVars = new Set();
  const localVars = new Set();

  lines.forEach((line, lineIndex) => {
    // Skip comment lines
    const trimmed = line.trim();
    if (trimmed.startsWith('--')) return;

    // Check for module variable declarations
    const moduleMatch = line.match(/\bmodule\.([a-zA-Z_][a-zA-Z0-9_]*)\s*=/);
    if (moduleMatch) moduleVars.add(moduleMatch[1]);

    // Check for local variable declarations
    const localMatch = line.match(/\bvar:local\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=/);
    if (localMatch) localVars.add(localMatch[1]);

    // ── CASE SENSITIVITY CHECKS ──
    const wrongCaseKeywords = [
      { wrong: /\bVar\b/, correct: 'var' },
      { wrong: /\bVAR\b/, correct: 'var' },
      { wrong: /\bConst\b/, correct: 'const' },
      { wrong: /\bCONST\b/, correct: 'const' },
      { wrong: /\bFunc\b/, correct: 'func' },
      { wrong: /\bFUNC\b/, correct: 'func' },
      { wrong: /\bIf\b/, correct: 'if' },
      { wrong: /\bIF\b/, correct: 'if' },
      { wrong: /\bElse\b/, correct: 'else' },
      { wrong: /\bWhile\b/, correct: 'while' },
      { wrong: /\bFor\b/, correct: 'for' },
      { wrong: /\bDo\b/, correct: 'do' },
      { wrong: /\bEnd\b/, correct: 'end' },
      { wrong: /\bReturn\b/, correct: 'return' },
      { wrong: /\bPrint\b/, correct: 'print' },
      { wrong: /\bPRINT\b/, correct: 'print' },
      { wrong: /\bTrue\b/, correct: 'true' },
      { wrong: /\bFalse\b/, correct: 'false' },
      { wrong: /\bAnd\b/, correct: 'and' },
      { wrong: /\bOr\b/, correct: 'or' },
      { wrong: /\bNot\b/, correct: 'not' },
    ];

    wrongCaseKeywords.forEach(({ wrong, correct }) => {
      const match = line.match(wrong);
      if (match) {
        const startChar = line.indexOf(match[0]);
        const range = new vscode.Range(lineIndex, startChar, lineIndex, startChar + match[0].length);
        const diagnostic = new vscode.Diagnostic(
          range,
          `Proton is case sensitive. Did you mean '${correct}'? (Autocorrect: change to '${correct}')`,
          vscode.DiagnosticSeverity.Error
        );
        diagnostic.code = 'wrong-case';
        diagnostic.source = 'Proton#';
        diagnostics.push(diagnostic);
      }
    });

    // ── CHECK: local var name conflicts with a module var ──
    const localDeclMatch = line.match(/\bvar:local\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=/);
    if (localDeclMatch) {
      const varName = localDeclMatch[1];
      if (moduleVars.has(varName)) {
        const startChar = line.indexOf(varName);
        const range = new vscode.Range(lineIndex, startChar, lineIndex, startChar + varName.length);
        const diagnostic = new vscode.Diagnostic(
          range,
          `'${varName}' is already used globally as module.${varName}. Please choose a different name or change the other variable.`,
          vscode.DiagnosticSeverity.Warning
        );
        diagnostic.source = 'Proton#';
        diagnostics.push(diagnostic);
      }
    }

    // ── CHECK: missing semicolon ──
    // Skip lines ending with do, end, --, or that are blank
    const noSemiNeeded = /(\bdo\s*$|\bend\s*;?\s*$|--|\{|\}|^\s*$|^@)/;
    if (!noSemiNeeded.test(trimmed) && trimmed.length > 0 && !trimmed.endsWith(';') && !trimmed.startsWith('--')) {
      const range = new vscode.Range(lineIndex, line.length, lineIndex, line.length);
      const diagnostic = new vscode.Diagnostic(
        range,
        `Missing semicolon. Every Proton statement must end with ';'`,
        vscode.DiagnosticSeverity.Warning
      );
      diagnostic.source = 'Proton#';
      diagnostics.push(diagnostic);
    }
  });

  diagnosticCollection.set(document.uri, diagnostics);
}

function activate(context) {
  console.log('Proton# extension activated!');

  // Show welcome message on first activation
  vscode.window.showInformationMessage(
    '⚡ Proton# extension loaded! Open a .pros file to get started.',
    'Open Docs'
  ).then(selection => {
    if (selection === 'Open Docs') {
      vscode.env.openExternal(vscode.Uri.parse('https://protonlanguage.github.io/docs'));
    }
  });

  // Register completion provider
  context.subscriptions.push(completionProvider);

  // Validate on open
  if (vscode.window.activeTextEditor) {
    validateDocument(vscode.window.activeTextEditor.document);
  }

  // Validate on change
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(e => validateDocument(e.document))
  );

  // Validate on open
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) validateDocument(editor.document);
    })
  );

  // Clean up diagnostics when file is closed
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument(doc => {
      diagnosticCollection.delete(doc.uri);
    })
  );

  context.subscriptions.push(diagnosticCollection);
}

function deactivate() {
  diagnosticCollection.clear();
}

module.exports = { activate, deactivate };

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, 'useFocusedInputScroll.ts'), 'utf8');
const listeners = {};
let activeInput;
let scroll;
const mockReact = {
  useRef: value => ({ current: value }),
  useCallback: callback => callback,
  useEffect: callback => { callback(); },
};
const mockNative = {
  Keyboard: { addListener: (event, callback) => { listeners[event] = callback; return { remove() {} }; } },
  TextInput: { State: { currentlyFocusedInput: () => activeInput } },
};
const moduleExports = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports: moduleExports,
  require: name => name === 'react' ? mockReact : mockNative,
  requestAnimationFrame: callback => callback(),
});

const keyboardScroll = moduleExports.useFocusedInputScroll();
const moves = [];
keyboardScroll.scrollRef.current = { scrollTo: position => moves.push(position) };
keyboardScroll.onScroll({ nativeEvent: { contentOffset: { y: 100 } } });
activeInput = { measureInWindow: callback => callback(0, 250, 100, 40) };
listeners.keyboardDidShow({ endCoordinates: { screenY: 300 } });
assert.equal(moves.at(-1).y, 162, 'focused input plus adjacent actions clear the keyboard');
assert.equal(moves.at(-1).animated, true);
keyboardScroll.onScroll({ nativeEvent: { contentOffset: { y: 162 } } });
activeInput = { measureInWindow: callback => callback(0, 80, 100, 40) };
keyboardScroll.onInputFocus();
assert.equal(moves.length, 1, 'visible input does not jump upward');
listeners.keyboardDidHide();
activeInput = { measureInWindow: callback => callback(0, 250, 100, 40) };
keyboardScroll.onInputFocus();
assert.equal(moves.length, 1, 'closed keyboard does not change scroll position');
console.log('PASS keyboard visibility, focused input clearance, no upward jump, close restoration');

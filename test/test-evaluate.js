import { test } from 'tape-promise/tape';
import evaluate, {
  evaluateExpr,
  evaluateProgram,
  makeEvaluators,
} from '../src/index';

const evaluators = {
  evaluate,
  evaluateExpr,
  evaluateProgram,
};

test('leakage', t => {
  try {
    for (const [name, myEval] of Object.entries(evaluators)) {
      t.throws(
        () => myEval('scopedEval'),
        ReferenceError,
        `${name} does not leak`,
      );
      t.throws(
        () => myEval('makeEvaluator'),
        ReferenceError,
        `${name} does not leak`,
      );
      t.equal(myEval('this'), undefined, `${name} does not leak this`);
    }
    t.equal(
      evaluate('function myName() { return this; }')(),
      undefined,
      `evaluate does not leak nested this`,
    );
    t.equal(
      evaluateExpr('function myName() { return this; }')(),
      undefined,
      `evaluateExpr does not leak nested this`,
    );
    t.equal(
      evaluateProgram('function myName() { return this; }; myName')(),
      undefined,
      `evaluateProgram does not leak nested this`,
    );
  } catch (e) {
    t.assert(false, e);
  } finally {
    t.end();
  }
});

test('basic', t => {
  try {
    for (const [name, myEval] of Object.entries(evaluators)) {
      t.equal(myEval('1+2'), 3, `${name} addition`);
      t.equal(myEval('(a,b) => a+b')(1, 2), 3, `${name} arrow expr`);
      t.equal(myEval(`(1,eval)('123')`), 123, `${name} indirect eval succeeds`);
    }
    t.equal(
      evaluate('function myName(a,b) { return a+b; }')(1, 2),
      3,
      `evaluate function expr`,
    );
    t.equal(
      evaluateExpr('function myName(a,b) { return a+b; }')(1, 2),
      3,
      `evaluateExpr function expr`,
    );
    t.equal(
      evaluateProgram('function myName(a,b) { return a+b; }; myName')(1, 2),
      3,
      `evaluateProgram function expr`,
    );
    t.throws(() => evaluate('123; 234'), SyntaxError, `evaluate fails program`);
    t.throws(
      () => evaluateExpr('123; 234'),
      SyntaxError,
      `evaluateExpr fails program`,
    );
    t.equal(evaluateProgram('123; 234'), 234, 'evaluateProgram succeeds');
  } catch (e) {
    t.assert(false, e);
  } finally {
    t.end();
  }
});

test('endowments', t => {
  try {
    for (const [name, myEval] of Object.entries(evaluators)) {
      t.equal(myEval('1+a', { a: 2 }), 3, `${name} endowment addition`);
      t.equal(
        myEval('(a,b) => a+b+c', { c: 3 })(1, 2),
        6,
        `${name} endowment arrow expr`,
      );
      t.equal(
        myEval('1+a+b', { a: 2, b: 3 }),
        6,
        `${name} multiple endowments`,
      );
    }
    t.equal(
      evaluate('function myName(a,b) { return a+b+c; }', { c: 3 })(1, 2),
      6,
      `evaluate endowment function expr`,
    );
    t.equal(
      evaluateExpr('function myName(a,b) { return a+b+c; }', { c: 3 })(1, 2),
      6,
      `evaluateExpr endowment function expr`,
    );
    t.equal(
      evaluateProgram('function myName(a,b) { return a+b+c; }; myName', {
        c: 3,
      })(1, 2),
      6,
      `evaluateProgram endowment function expr`,
    );
  } catch (e) {
    t.assert(false, e);
  } finally {
    t.end();
  }
});

test('options.transforms', t => {
  try {
    const endowments = Object.create(null, {
      foo: { value: 1 },
      bar: { value: 2, writable: true },
    });

    const evalTransforms = [
      {
        endow(es) {
          return { ...es, endowments: { ...es.endowments, abc: 123 } };
        },
        rewrite(ss) {
          const src =
            (ss.src === 'ABC' ? 'abc' : ss.src) + (ss.isExpr ? '' : ';');
          return { ...ss, src };
        },
      },
    ];

    const options = {
      transforms: [
        {
          rewrite(ss) {
            return { ...ss, src: ss.src === 'ABC' ? 'def' : ss.src };
          },
        },
      ],
    };

    const { evaluateExpr: myExpr, evaluateProgram: myProg } = makeEvaluators({
      endowments,
      transforms: evalTransforms,
    });

    t.equal(
      myProg('234; abc', {}),
      123,
      `evalTransforms don't rewrite program`,
    );
    t.equal(myProg('ABC', {}), 123, `evalTransforms rewrite program`);
    t.equal(myExpr('abc', {}), 123, `evalTransforms don't rewrite`);
    t.equal(myExpr('ABC', { ABC: 234 }), 123, `evalTransforms rewrite ABC`);
    t.equal(
      myExpr('ABC', { ABC: 234, abc: 'notused' }),
      123,
      `endowments.abc is overridden`,
    );
    t.equal(
      myExpr('ABC', { def: 789 }, options),
      789,
      `options.transforms go first`,
    );
  } catch (e) {
    t.assert(false, e);
  } finally {
    t.end();
  }
});
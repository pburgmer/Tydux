import {assert} from "chai";
import {AngularJS1ScopeLike, IAngularEvent, toAngularJSScope} from "./angularjs-integration";
import {enableTyduxDevelopmentMode} from "./development";
import {resetTydux} from "./global-state";
import {Mutators} from "./mutators";
import {Store} from "./Store";


describe("AngularJS integration", function () {

    beforeEach(() => enableTyduxDevelopmentMode());

    afterEach(() => resetTydux());

    it("wraps the delivery of events in scope.$apply()", function () {

        type State = { a: number };

        class TestMutator extends Mutators<State> {
            inc() {
                this.state.a++;
            }
        }

        class TestStore extends Store<TestMutator, State> {
            action() {
                this.mutate.inc();
            }
        }

        const events: any[] = [];
        const store = new TestStore("", new TestMutator(), {a: 0});

        class DummyScope implements AngularJS1ScopeLike {

            $$phase = "";

            constructor(public $root?: AngularJS1ScopeLike) {
            }

            $apply(exp: (scope: AngularJS1ScopeLike) => any) {
                events.push("pre");
                exp(this);
                events.push("post");
            }

            $on(name: string, listener: (event: IAngularEvent, ...args: any[]) => any) {
                return () => {
                };
            }
        }

        const rootScope = new DummyScope();
        const scope = new DummyScope(rootScope);

        store.bounded(toAngularJSScope(scope))
            .select(s => s.a)
            .subscribe(a => events.push(a));

        store.action();

        assert.deepEqual(events, [
            "pre",
            0,
            "post",
            "pre",
            1,
            "post",
        ]);

    });

});
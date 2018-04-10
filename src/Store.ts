import * as _ from "lodash";
import {OperatorFunction} from "rxjs/interfaces";
import {Observable} from "rxjs/Observable";
import {ReplaySubject} from "rxjs/ReplaySubject";
import {deepFreeze} from "./deep-freeze";
import {isTyduxDevelopmentModeEnabled} from "./development";
import {mutatorHasInstanceMembers} from "./error-messages";
import {addStoreToGlobalState} from "./global-state";
import {Mutators} from "./mutators";
import {noopOperator, StoreObserver} from "./StoreObserver";
import {createFailingProxy, createProxy, failIfNotUndefined} from "./utils";

export interface Action {
    [param: string]: any;

    type: string;
}

export class MutatorEvent<S> {
    constructor(readonly storeId: string,
                readonly action: Action,
                readonly state: S,
                public duration?: number) {
    }
}

export function failIfInstanceMembersExistExceptState(obj: any) {
    let members = _.keys(obj);
    let idxOfState = members.indexOf("state");
    if (idxOfState >= 0) {
        members.splice(idxOfState, 1);
    }
    if (members.length > 0) {
        throw new Error(mutatorHasInstanceMembers + ": " + members.join(","));
    }
}

export function createActionFromArguments(actionTypeName: string, fn: any, args: IArguments): Action {
    const fnString = fn.toString();
    const argsString = fnString.substring(fnString.indexOf("(") + 1, fnString.indexOf(")"));
    const argNames = argsString.split(",").map((a: string) => a.trim());

    const action: any = {};
    for (let i = 0; i < args.length; i++) {
        const arg = "[" + i + "] " + argNames[i];
        action[arg] = args[i];
    }
    action.type = actionTypeName;

    return action;
}

export abstract class Store<M extends Mutators<S>, S> {

    private _state: S = undefined as any;

    private mutatorCallStackCount = 0;

    private readonly mutatorEventsSubject = new ReplaySubject<MutatorEvent<S>>(1);

    protected readonly mutate: M;

    readonly mutatorEvents$: Observable<MutatorEvent<S>> = this.mutatorEventsSubject;

    constructor(readonly storeId: string,
                mutatorInstance: Mutators<S>,
                state: S) {

        this.processMutator(new MutatorEvent(
            this.storeId,
            {type: "@@INIT"},
            state
        ));

        failIfInstanceMembersExistExceptState(mutatorInstance);

        this.mutate = this.createMutatorsProxy(mutatorInstance);
        delete (this.mutate as any).state;

        addStoreToGlobalState(this);
    }

    get state(): Readonly<S> {
        return this._state;
    }

    bounded(operator: OperatorFunction<MutatorEvent<S>, MutatorEvent<S>>): StoreObserver<S> {
        return new StoreObserver(this.mutatorEvents$, operator);
    }

    unbounded(): StoreObserver<S> {
        return new StoreObserver(this.mutatorEvents$, noopOperator);
    }

    private processMutator(mutatorEvent: MutatorEvent<S>) {
        this.setState(mutatorEvent.state);
        this.mutatorEventsSubject.next(mutatorEvent);
    }

    private setState(state: S) {
        this._state = isTyduxDevelopmentModeEnabled() ? deepFreeze(state) : state;
    }

    private mutateState(fn: (state: S, isRootCall: boolean) => MutatorEvent<S>): void {
        const isRoot = this.mutatorCallStackCount === 0;
        this.mutatorCallStackCount++;
        try {
            const stateProxy = createProxy(this.state);
            const start = isTyduxDevelopmentModeEnabled() ? Date.now() : 0;
            let mutatorEvent = fn(stateProxy, isRoot);
            if (isTyduxDevelopmentModeEnabled()) {
                mutatorEvent.duration = Date.now() - start;
            }
            if (isRoot) {
                this.processMutator(mutatorEvent);
            }
        } finally {
            this.mutatorCallStackCount--;
        }
    }

    private createMutatorsProxy(mutatorsInstance: any): M {
        const proxyObj = {} as any;
        const proxyProto = {} as any;
        Object.setPrototypeOf(proxyObj, proxyProto);

        for (let mutatorName of _.functionsIn(mutatorsInstance)) {
            const mutatorFn = mutatorsInstance[mutatorName];
            const self = this;

            proxyProto[mutatorName] = function () {
                Object.setPrototypeOf(proxyProto, {});

                const args = arguments;
                let result: any = undefined;

                self.mutateState((oldState, isRootCall) => {
                    // call mutator
                    let thisObj = this;
                    if (isRootCall) {
                        proxyObj.state = oldState;
                        const tempThisObj = {};
                        Object.setPrototypeOf(tempThisObj, proxyObj);
                        thisObj = tempThisObj;
                    }

                    result = mutatorFn.apply(thisObj, args);
                    failIfNotUndefined(result);
                    failIfInstanceMembersExistExceptState(thisObj);
                    proxyObj.state = thisObj.state;

                    const mutatorEvent = new MutatorEvent(
                        this.storeId,
                        createActionFromArguments(mutatorName, mutatorFn, args),
                        proxyObj.state
                    );

                    if (isRootCall) {
                        Object.setPrototypeOf(thisObj, createFailingProxy());
                    }

                    return mutatorEvent;
                });

                return result;
            };
        }

        return proxyObj;
    }

}

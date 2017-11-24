import React from 'react';
import invariant from 'invariant';

/* utils start */
const cache = new Map();

const setCache = (path, value) => {
    cache.set(path, value);
};

const getCache = path => {
    return cache.get(path);
};
/* utils end */

const parseModelConfig = model => {
    let ret = {};
    if (typeof model === 'string') {
        ret.namespace = model;
    }
    else {
        ret = model;
    }
    // 检查prefix
    invariant(!ret.prefix || /\$$/.test(ret.prefix), '[connectWithContext] model.prefix must end with `$`.');
    return ret;
};
const getModelConfig = modelContext => {
    return Object.keys(modelContext).reduce((ret, key) => {
        // 检查namespace
        invariant(/^\$/.test(key), `[connectWithContext] Abstract model's namespace must start with \`$\`.`);
        ret[key] = parseModelConfig(modelContext[key]);
        return ret;
    }, {});
};
const wrapDispatchWithModelContext = (dispatch, modelConfig) => {
    return action => {
        let type = action.type;
        const [namespace, reducer] = type.split('/');
        if (modelConfig[namespace]) {
            type = modelConfig[namespace].namespace + '/' + (modelConfig[namespace].prefix || '') + reducer;
        }
        dispatch({
            ...action,
            type
        });
    };
};
const proxyStateForModel = (state, modelConfig) => {
    Object.keys(modelConfig).forEach(key => {
        const {namespace, prefix} = modelConfig[key];
        !state.hasOwnProperty(key) && Object.defineProperty(state, key, {
            get() {
                let modelState = state[namespace];
                // 有前缀的话
                if (prefix) {
                    modelState = Object.keys(modelState).reduce((ret, field) => {
                        !field.indexOf(prefix) && (ret[field.substr(prefix.length)] = modelState[field]);
                        return ret;
                    }, {});
                }

                return modelState;
            }
        });
    });
    return state;
};
const wrapGetStateWithModelContext = (getState, modelConfig) => {
    return () => {
        const state = getState();
        return proxyStateForModel(state, modelConfig);
    };
};

export const handleWithContext = (modelContext, handler) => {
    const modelConfig = getModelConfig(modelContext);
    return ({dispatch, getState}, ...args) => {
        const storeApi = {};
        dispatch && (storeApi.dispatch = wrapDispatchWithModelContext(dispatch, modelConfig));
        getState && (storeApi.getState = wrapGetStateWithModelContext(getState, modelConfig));
        return handler.call(null, storeApi, ...args);
    };
};

export const extendModel = (model2, options, model1) => {
    if (!model1 && options.namespace) {
        model1 = options;
        options = {};
    }
    const {prefix = ''} = options;

    // model2 namespace 检查
    invariant(/^\$/.test(model2.namespace), `[connectWithContext] Abstract model's namespace must start with \`$\`.`);
    // 重复字段检查
    ['state', 'reducers'].forEach(key => {
        Object.keys(model1[key]).forEach(item => {
            invariant(
                !model2[key].hasOwnProperty(item),
                `[connectWithContext] Main model has already defined \`${key}.${item}\``
            );
        });
    });
    return {
        namespace: model1.namespace,
        state: {
            ...model1.state,
            ...(!prefix ? model2.state : Object.keys(model2.state).reduce((ret, key) => {
                ret[prefix + key] = model2.state[key];
                return ret;
            }, {}))
        },
        reducers: {
            ...model1.reducers,
            ...(!prefix ? model2.reducers : Object.keys(model2.reducers).reduce((ret, key) => {
                ret[prefix + key] = (state, action) => {
                    const prefixedState = Object.keys(model2.state).reduce((ret, key) => {
                        ret[key.substr(prefix.length)] = state[key];
                        delete ret[key];
                        return ret;
                    }, {...state});
                    const nextState = model2.reducers[key](prefixedState, action);
                    return Object.keys(model2.state).reduce((ret, key) => {
                        ret[prefix + key] = nextState[key];
                        delete nextState[key];
                        return ret;
                    }, nextState);
                };
                return ret;
            }, {}))
        }
    };
};

export default app => (getUIState, callbacks = {}, ...connectArgs) => {
    return UI => {
        return modelContext => {
            class ConnectedWithContext extends React.Component {

                getChildContext() {
                    return modelContext ? {
                        model: {
                            ...(this.context.model || {}),
                            ...modelContext
                        }
                    } : undefined;
                }

                render() {
                    const modelCtx = modelContext || this.context.model;
                    invariant(
                        modelCtx,
                        '[connectWithContext] No model context found!'
                    );

                    let Component;
                    const cachePath = [getUIState, callbacks, UI, JSON.stringify(modelCtx)];
                    Component = getCache(cachePath);
                    if (!Component) {
                        const modelConfig = getModelConfig(modelCtx);
                        const wrappedModelGetUIState = (state, ...args) => {
                            return getUIState(proxyStateForModel(state, modelConfig), ...args);
                        };
                        const wrappedModelCallbacks = Object.keys(callbacks).reduce((ret, key) => {
                            ret[key] = ({dispatch, getState}, ...args) => {
                                callbacks[key].call(null, {
                                    dispatch: wrapDispatchWithModelContext(dispatch, modelConfig),
                                    getState: wrapGetStateWithModelContext(getState, modelConfig)
                                }, ...args);
                            };
                            return ret;
                        }, {});

                        Component = app.connect(wrappedModelGetUIState, wrappedModelCallbacks, ...connectArgs)(UI);
                        setCache(cachePath, Component);
                    }

                    return <Component {...this.props}/>;
                }
            }

            ConnectedWithContext.contextTypes = {
                model: React.PropTypes.any.isRequired
            };

            if (modelContext) {
                ConnectedWithContext.childContextTypes = {
                    model: React.PropTypes.any.isRequired
                };
            }

            return ConnectedWithContext;
        }
    };
};
# deef插件：支持带model上下文的connect
用于封装大型公共业务组件（公共的deef形式组件 而非 state+生命周期的组件）

## 背景
对于公共的业务组件如果封装成state+生命周期的组件，当组件的体量较大时不便维护

如果还用普通的deef组件形式，共用同一份model数据，相互之间会产生干扰（组件可以实例化多份，但model是单例的）

本插件结合两者的优势，**引入abstract model的概念，巧妙解决了大型公共业务组件的问题**

## 特点
- 公共业务组件的开发没有额外成本，跟deef业务组件保持一直，便于维护
- 有单项数据流加持，当组件体量较大时也不惧
- 没有黑魔法，相当于一个语法糖，最终运行时还是普通deef形式，没有额外的调试成本

## 原理
- 开发时，引入abstract model，面向抽象而非具体实现
- 运行时，代理所有对abstract model的访问，代理到具体的model
- 巧妙地利用对引用做缓存，避开了组件unmount（输入型组件unmount会失焦）

## 示例
- 一个组件实例，要对应到一个独立的数据源（将unitModel整合到业务调用的model，如定向包model中）
- 公共deef组件，读model要从相应的业务model中取值
- 公共deef组件，写model要写到相应的业务model中去

  此处提到的unitModel即为abstract model，不会实际整合到deef的大model中去，但是公共deef组件的代码实现可以直接用这个model（面向抽象而非具体实现）

### 如何用
app.js
```js
import deef from 'deef';
import buildConnectWithContext, {extendModel, handleWithContext} from 'deef-plugin-connect-with-context';

const app = deef();

export const connect = app.connect;
export const connectWithContext = buildConnectWithContext(app);
export {handleWithContext, extendModel};
```
公共组件，要有一个abstract model，并在feedAds/entry/Root/models/abstractModels.js中注册
公共组件的index文件由之前的app.connect变成app.connectWithModel。
eg:
```js
import {connectWithContext} from 'app';
const buildComponent = connectWithContext(getUIState, callbacks)(UI);
```
**connectWithContext得到的是一个高阶组件（modelContext => component），需要在使用时声明model上下文，如：**
```js
const Component = buildComponent({$unit: 'targetPackageItem'});
```
*如buildComponent()直接传空，不声明上下文，则会自动找上级组件的model context*


### 如何写
1、在调用公共组件的父级model中将公共组件的model数据extend过来
如在namespace名为'targetPackageItem' 的组件model中调用公共组件Preference, 其状态数据存在namespace为'$unit'的model中：
```js
const unitModel = {
	namespace: '$unit', // 必须为$打头
	state: {
		preference: {}
	},
	reducers: {
		setPreference(state, {payload: merge}) {
			// return ...
		}
	}
};
const model = app.extendModel({}, unitModel, {
	namespace: 'targetPackageItem',
	state: {},
	rudecers: {}
});
return model;
```
2、在Preference公共组件调用的地方注入targetPackageItem model名
```js
const Preference = require('Preference组件路径').default({$unit: 'targetPackageItem'});
```
其中$unit为Preference公共组件定义的抽象model名，可根据不同的需求自己定义。


3、组件会对应有init、getValue，同样依赖modelContext，需要通过app.handleWithContext(modelContext, handler)({dispatch, getState}, ...args)的方式调用

4、如果想一个model中使用俩个相同的公共组件，可以使用{prefix: 'another$'}加前缀的方式解决，extendModel第二个参数传入{prefix: 'another$'}（可多次extendModel），buildComponent({$unit: {namespace: 'targetGroupList', prefix: 'another$'}})，通过prefix也可以解决abstract model与业务model命名冲突的问题

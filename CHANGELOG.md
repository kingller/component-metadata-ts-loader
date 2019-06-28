标签：
<font color=green>新增</font>
<font color=orange>修改</font>
<font color=blue>增强</font>
<font color=red>修复</font>
<font color=red><strong>删除</strong></font>


# 2.2.0
<font color=orange>修改</font> `TypeScript`默认`compilerOptions`移除`2.1.0`中加入的`esModuleInterop`，使用`allowSyntheticDefaultImports`即可支持

# 2.1.0
<font color=orange>修改</font> `TypeScript`默认`compilerOptions`加上如下配置，以支持导入方式`import React from 'react';`
```
  esModuleInterop: true, // 可调用的CommonJS模块必须被做为默认导入，在已有的“老式”模块模式之间保证最佳的互通性
  allowSyntheticDefaultImports: true // 允许使用 ES2015 默认的 import 风格
```

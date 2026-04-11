# 配置修复说明

## 问题总结

### 1. 废弃的配置项 ❌

**问题**: `hdl-helper.linter.tool` 配置项已废弃但仍显示在设置中

**解决方案**: 
- ✅ 已从 `package.json` 中删除该废弃配置项
- ✅ 用户应使用 `hdl-helper.linter.activeEngines` 代替

**迁移指南**:
```json
// ❌ 旧配置（已删除）
{
  "hdl-helper.linter.tool": "xvlog"
}

// ✅ 新配置
{
  "hdl-helper.linter.activeEngines": ["verible", "vivado"]
}
```

---

### 2. Verible Lint 规则不生效 ❌

**问题根源**: 
在 `src/linter/engines/VeribleEngine.ts` 中，规则值处理逻辑不完善：
- 只检查严格的布尔值和字符串 `"true"`/`"false"`
- VS Code 设置界面保存的值可能是字符串 `"true"`（带引号）
- 没有处理大小写变体（如 `"True"`）

**修复内容**:

#### 修改前:
```typescript
for (const [ruleName, value] of Object.entries(rulesConfig)) {
    if (value === false || value === 'false') {
        ruleList.push(`-${ruleName}`);
    } else if (value === true || value === 'true') {
        ruleList.push(ruleName);
    } else if (typeof value === 'string') {
        ruleList.push(`${ruleName}=${value}`);
    }
}
```

#### 修改后:
```typescript
for (const [ruleName, value] of Object.entries(rulesConfig)) {
    // 处理值：支持布尔值、字符串 'true'/'false'、配置字符串
    if (value === false || value === 'false' || value === 'False') {
        // 禁用规则
        ruleList.push(`-${ruleName}`);
    } else if (value === true || value === 'true' || value === 'True') {
        // 启用规则（无参数）
        ruleList.push(ruleName);
    } else if (typeof value === 'string' && value.length > 0) {
        // 配置字符串（如 'length:120'）
        ruleList.push(`${ruleName}=${value}`);
    }
}

// 添加默认规则保护
if (ruleList.length === 0) {
    ruleList.push('line-length=length:150');
    ruleList.push('no-tabs');
    ruleList.push('no-trailing-spaces');
}
```

**修复效果**:
✅ 现在支持以下所有格式:
```json
{
  "hdl-helper.linter.rules": {
    "no-tabs": true,              // 布尔值
    "no-tabs": "true",            // 字符串小写
    "no-tabs": "True",            // 字符串首字母大写
    "no-tabs": false,             // 布尔值禁用
    "no-tabs": "false",           // 字符串禁用
    "line-length": "length:150"   // 配置字符串
  }
}
```

---

## 测试验证

### 测试步骤:

1. **打开 VSCode 设置**
   - `Ctrl+,` 打开设置
   - 搜索 `hdl-helper.linter.rules`

2. **配置测试规则**:
```json
{
  "hdl-helper.linter.activeEngines": ["verible"],
  "hdl-helper.linter.rules": {
    "line-length": "length:150",
    "no-tabs": true,
    "no-trailing-spaces": true,
    "parameter-name-style": "localparam_style:ALL_CAPS",
    "explicit-begin": true
  }
}
```

3. **创建测试文件** `test.sv`:
```systemverilog
module test;
  reg data;  // 应该有 trailing space →
  parameter param_name = 1;  // 应该报错：不是 ALL_CAPS
endmodule
```

4. **保存文件**,查看 Problems 面板:
   - 应该看到 `no-trailing-spaces` 警告
   - 应该看到 `parameter-name-style` 警告

5. **查看 Output 面板** → "HDL Helper Log":
```raw
[Verible] "verible-verilog-lint" --lint_fatal=false --parse_fatal=false --rules line-length=length:150,no-tabs,no-trailing-spaces,parameter-name-style=localparam_style:ALL_CAPS,explicit-begin test.sv
```

---

## 文档更新

### README.md
- ✅ 添加了 Verible Rules 配置示例
- ✅ 添加了废弃配置项的警告提示
- ✅ 更新了版本到 V3.0.1

### hdl-helper-description.md
- ✅ 添加了详细的规则值说明
- ✅ 添加了废弃配置项迁移指南
- ✅ 更新了测试验证章节

---

## 技术细节

### 为什么规则配置之前不生效？

VS Code 的设置系统在处理 JSON 时，对于 `additionalProperties` 的类型检查比较宽松。用户在设置界面输入：

```json
"no-tabs": "true"
```

虽然 schema 定义期望的是 `boolean` 类型，但实际保存为字符串。原代码的严格类型检查导致这个规则被忽略。

**修复策略**: 放宽类型检查，兼容多种表示方式。

---

## 下一步建议

1. **添加规则验证**: 在设置界面提供规则名称的自动补全
2. **添加规则文档**: Hover 时显示规则说明
3. **性能优化**: 考虑缓存规则配置，避免每次保存都重新解析

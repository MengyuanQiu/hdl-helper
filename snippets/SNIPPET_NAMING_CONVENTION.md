# STATUS UPDATE (2026-04-11)

- templates 命名空间已启用：tpl.rtl.*（首批 rv/fsm/cdc 模板）。
- tpl.* 与 sv/rtl/sva/sdc/xdc/sta/uvm 运行级前缀保持语义分层，避免混用。

# SNIPPET NAMING CONVENTION

本文件定义 prefix 命名规则与风格契约，作为后续迁移的唯一命名基线。

## Prefix 规则

统一格式：domain.subdomain.object

示例：

- sv.mod
- sv.aff
- rtl.reg.ce
- rtl.cdc.2ff
- rtl.fsm.3seg
- sva.req2ack
- sdc.clock.create
- xdc.debug.mark
- uvm.cfg.get

## 域名约定

- sv: SystemVerilog 语言级片段。
- rtl: 设计级实现模式。
- sva: 断言与 formal 模式。
- sdc/xdc/sta: 约束与时序查询。
- uvm: 验证平台构件。
- tpl: 保留给后续 templates 命名空间。

## 缩写约定

- aff: always_ff
- acomb: always_comb
- alatch: always_latch
- rv: ready/valid
- cfg: configuration
- fwd: forwarding
- reqack: request/acknowledge

## 命名约束

- 全小写。
- 用点分隔，不使用空格和括号。
- 一个 prefix 对应一个语义，不复用多义前缀。
- 优先可搜索性：按 domain -> subdomain 渐进输入可检索。

## Snippet 与 Template 命名边界

- Snippet: sv.*, rtl.*, sva.*, sdc.*, xdc.*, sta.*, uvm.*
- Template（后续）: tpl.rtl.*, tpl.uvm.*

## 输出风格契约

默认命名：

- clock: clk_i
- active-low reset: rst_ni
- input/output: *_i / *_o
- registered state/data: *_q
- next state/data: *_d

默认编码风格：

- 时序逻辑使用 always_ff
- 组合逻辑使用 always_comb
- FSM 默认 typedef enum logic
- 组合逻辑默认赋值先行
- 统一 end 标签：endmodule : name / endfunction : name / endtask : name

## 废弃策略

- 旧 prefix 在迁移图中标记为 deprecate。
- 新增内容只允许使用新命名规范。
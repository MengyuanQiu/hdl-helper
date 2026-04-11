# STATUS UPDATE (2026-04-11)

- package.json snippets 映射切换已完成（legacy -> 新目录）。
- 旧目录 `snippets/design`、`snippets/verification` 保留为迁移追踪用途，不再作为活跃维护路径。
- 本文中的“旧文件 -> 新文件”映射继续保留，用于审计和回溯；新增需求必须直接落在新目录。
- 约束策略详见 `snippets/LEGACY_POLICY.md`。

# MIGRATION MAP

状态定义：

- keep: 语义保留迁移。
- rename: 改名前缀后迁移。
- split: 一拆多。
- deprecate: 仅兼容保留，不再扩展。
- rewrite: 需要重写后再迁移。

## 文件级映射

| 旧文件 | 新文件 | 策略 | 说明 |
| --- | --- | --- | --- |
| snippets/design/basic.json | snippets/sv/01..07 | split | 语言级拆分 |
| snippets/design/common.json | snippets/rtl/12, 15, 16 | split | CDC/计数/编码分治 |
| snippets/design/logic.json | snippets/rtl/13 | split + rewrite | 去除项目耦合依赖 |
| snippets/design/fsm/fsm_mealy.json | snippets/rtl/14 | merge | 并入 FSM 总类 |
| snippets/design/fsm/fsm_moore.json | snippets/rtl/14 | merge | 并入 FSM 总类 |
| snippets/design/architecture/pipeline.json | snippets/rtl/17, snippets/rtl/11 | split | 流水线与 rv 分离 |
| snippets/design/architecture/interconnect.json | snippets/rtl/16, snippets/rtl/18 | split | 编码与互连分离 |
| snippets/verification/sva/assertions.json | snippets/sva/20..23 | split | 按验证对象拆分 |
| snippets/constraints/sdc.json | snippets/constraints/30, 31 | split | 基础与例外分离 |
| snippets/constraints/xdc.json | snippets/constraints/32, 33 | split | IO 与 query/debug 分离 |
| snippets/verification/uvm/base_classes.json | snippets/uvm/40 | keep + rename | 基础骨架收口 |
| snippets/verification/uvm/tlm.json | snippets/uvm/45 | keep + rename | TLM 收口 |
| snippets/verification/uvm/factory.json | snippets/uvm/44, 46 | split | factory/config 与 phase/message 分离 |
| snippets/verification/uvm/uvm_basic.json | snippets/uvm/40, 41, 42, 44, 45, 46 | split | 按平台构件拆分 |

## 代表性 prefix 映射

| 旧名称/旧前缀 | 新前缀 | 目标文件 | 状态 |
| --- | --- | --- | --- |
| module | sv.mod | snippets/sv/01_module_package_interface.json | rename |
| always_ff | sv.aff | snippets/sv/02_proc_blocks.json | rename |
| always_comb | sv.acomb | snippets/sv/02_proc_blocks.json | rename |
| always_latch | sv.alatch | snippets/sv/02_proc_blocks.json | rename |
| generate (for) | sv.gen.for | snippets/sv/05_generate.json | rename |
| generate (if) | sv.gen.if | snippets/sv/05_generate.json | rename |
| fifo (sync) | rtl.fifo.sync.shell | snippets/rtl/13_fifo_queue_buffer.json | rewrite |
| fsm (mealy) | rtl.fsm.mealy.3seg | snippets/rtl/14_fsm.json | rename |
| fsm (moore onehot) | rtl.fsm.onehot | snippets/rtl/14_fsm.json | rename |
| sva_stable_handshake | sva.rv.stable | snippets/sva/21_handshake_fifo_protocol.json | rename |
| sva_rose_impl | sva.rose.impl | snippets/sva/20_sequences_properties.json | rename |
| sva_onehot_grant | sva.arb.onehot | snippets/sva/22_fsm_arbiter_safety.json | rename |
| uvm_component | uvm.comp | snippets/uvm/40_uvm_base.json | rename |
| uvm_object | uvm.obj | snippets/uvm/40_uvm_base.json | rename |
| uvm_config_db_get | uvm.cfg.get | snippets/uvm/44_uvm_factory_config_db.json | rename |
| uvm_tlm_analysis_fifo | uvm.analysis.fifo | snippets/uvm/45_uvm_tlm_analysis.json | rename |

## 待人工审查项

| 项目 | 原因 | 下一步 |
| --- | --- | --- |
| design/logic.json 中项目耦合 FIFO | 依赖 rtl_pkg/rtl_mode_e | 先重写为通用 shell 再迁移 |
| interconnect crossbar 片段 | 当前端口/索引一致性风险 | 迁移前重写为 shell 版 |
| constraints/34_sta_reports_queries | 旧库缺失 | 新建一批 STA 查询模板 |
| uvm/43_uvm_agent_env_test | 旧库覆盖不足 | 新建 agent/env/test 基础骨架 |

## 切换计划

1. 先迁移 sv/sva/constraints。
2. 再迁移 rtl。
3. 最后迁移 uvm。
4. 完成验证后切换 package.json 的 snippets 路径。
5. 最终发布时标记 legacy snippets 为废弃。
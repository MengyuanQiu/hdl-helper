# STATUS UPDATE (2026-04-11)

- package.json 的 snippets 贡献映射已切换到新目录体系（sv/rtl/sva/constraints/uvm）。
- `snippets/design` 与 `snippets/verification` 现为只读参考目录，不再承载新增或维护。
- sv 前缀冲突已收口：
  - `sv.intf` / `sv.intf.raw` 用于 interface。
  - `sv.if` / `sv.ifelse` 用于控制流。
- 迁移后的活跃策略以 `snippets/LEGACY_POLICY.md` 为准。

# TEMPLATE PHASE UPDATE (2026-04-11)

- templates 层已开始落地，当前启用 rtl 模板文件：
  - snippets/templates/rtl/00_rv_templates.json
  - snippets/templates/rtl/01_fsm_templates.json
  - snippets/templates/rtl/02_cdc_templates.json
- 本轮模板优先复用已收口模式：rtl.rv.*、rtl.fsm.*、rtl.cdc.*。
- 模板前缀统一使用 tpl.rtl.*，与运行级 snippet 前缀解耦。
- package.json 已纳入 verilog/systemverilog snippets 映射，可直接补全调用。

# SNIPPETS CATALOG

本文件是重构阶段的“施工图”，用于定义 34 个 JSON 的职责边界、计划 snippet 名称与迁移来源。

## 阶段约束

- 本阶段只做规划，不写 snippet body。
- 核心 JSON 保持 34 个：sv/rtl/sva/constraints/uvm。
- templates 目录仅保留目录，不放 JSON（后续模板阶段再启用）。

## 34 文件清单

### sv/（8）

| 文件路径 | 职责 | 计划 snippet 名称 | 迁移来源 |
| --- | --- | --- | --- |
| snippets/sv/00_file_skeleton.json | 文件级骨架 | sv.file.header, sv.file.timescale, sv.file.resetall | 新增（参考现有风格） |
| snippets/sv/01_module_package_interface.json | 顶层声明 | sv.mod, sv.mod.param, sv.pkg, sv.import, sv.if, sv.modport | snippets/design/basic.json |
| snippets/sv/02_proc_blocks.json | 过程块 | sv.aff, sv.acomb, sv.alatch, sv.init, sv.assign | snippets/design/basic.json |
| snippets/sv/03_types_decl.json | 类型与声明 | sv.param, sv.localparam, sv.logic, sv.bit, sv.int, sv.shortint, sv.longint, sv.byte, sv.struct.packed, sv.typedef.enum, sv.enum, sv.queue, sv.aa, sv.mailbox | snippets/design/basic.json |
| snippets/sv/04_control_flow.json | 控制流 | sv.if, sv.case, sv.case.unique, sv.for, sv.foreach, sv.begin, sv.fork.join, sv.fork.join_any, sv.fork.join_none | snippets/design/basic.json |
| snippets/sv/05_generate.json | generate 结构 | sv.gen.for, sv.gen.if, sv.gen.case | snippets/design/basic.json |
| snippets/sv/06_tasks_functions.json | task/function/class | sv.func, sv.func.auto, sv.task, sv.task.auto, sv.class, sv.class.ext | snippets/design/basic.json |
| snippets/sv/07_debug_misc.json | 调试与杂项 | sv.display, sv.assert.imm, sv.posedge, sv.negedge | snippets/design/basic.json |

### rtl/（10）

| 文件路径 | 职责 | 计划 snippet 名称 | 迁移来源 |
| --- | --- | --- | --- |
| snippets/rtl/10_reg_reset.json | 寄存器与复位 | rtl.reg.basic, rtl.reg.ce, rtl.reg.clr, rtl.reg.ce_clr, rtl.reg.valid, rtl.reset.async_low, rtl.reset.sync, rtl.param.check, rtl.param.check.pow2 | 新增+现有风格 |
| snippets/rtl/11_handshake_ready_valid.json | ready/valid 模式 | rtl.rv.ifc, rtl.rv.slice, rtl.rv.skid, rtl.rv.elbuf, rtl.rv.valid_only, rtl.rv.fork, rtl.rv.join, rtl.rv.mux, rtl.rv.demux | 主要新增 |
| snippets/rtl/12_cdc_reset_crossing.json | CDC 与跨复位 | rtl.cdc.2ff, rtl.cdc.pulse, rtl.cdc.reqack, rtl.cdc.toggle, rtl.reset.release_sync, rtl.edge.detect, rtl.pulse.stretch, rtl.cdc.gray_ptr | snippets/design/common.json |
| snippets/rtl/13_fifo_queue_buffer.json | FIFO/队列/缓冲骨架 | rtl.fifo.sync.shell, rtl.fifo.async.shell, rtl.fifo.fwft.shell, rtl.buf.skid, rtl.buf.elastic1, rtl.queue.ring | snippets/design/logic.json（去耦后） |
| snippets/rtl/14_fsm.json | FSM 族 | rtl.fsm.2seg, rtl.fsm.3seg, rtl.fsm.mealy.3seg, rtl.fsm.moore, rtl.fsm.onehot, rtl.fsm.binary, rtl.fsm.illegal_recover, rtl.fsm.state_enum | snippets/design/fsm/* |
| snippets/rtl/15_counter_timer_shift.json | 计数/定时/移位 | rtl.counter, rtl.counter.sat, rtl.counter.wrap, rtl.timer, rtl.watchdog, rtl.shift.reg, rtl.debounce, rtl.clkdiv.logic | snippets/design/common.json |
| snippets/rtl/16_mux_encode_decode.json | mux/编解码 | rtl.mux.basic, rtl.mux.param, rtl.demux.basic, rtl.enc.priority, rtl.enc.onehot2bin, rtl.dec.bin2onehot, rtl.gray2bin, rtl.bin2gray | snippets/design/common.json, snippets/design/architecture/interconnect.json |
| snippets/rtl/17_pipeline.json | 流水线模式 | rtl.pipe.reg, rtl.pipe.valid, rtl.pipe.bubble, rtl.pipe.flush, rtl.pipe.fwd, rtl.pipe.stage | snippets/design/architecture/pipeline.json |
| snippets/rtl/18_arbiter_interconnect.json | 仲裁与互连 | rtl.arb.rr, rtl.arb.fixed, rtl.arb.mask, rtl.xbar.shell, rtl.addr.decode, rtl.req_gnt.matrix | snippets/design/architecture/interconnect.json |
| snippets/rtl/19_parameter_checks.json | 参数合法性检查 | rtl.param.check, rtl.param.check.pow2, rtl.param.check.width_rel, rtl.param.check.depth_min | 新增 |

### sva/（4）

| 文件路径 | 职责 | 计划 snippet 名称 | 迁移来源 |
| --- | --- | --- | --- |
| snippets/sva/20_sequences_properties.json | SVA 基元 | sva.seq, sva.prop, sva.assert, sva.cover, sva.assume, sva.rose.impl | snippets/verification/sva/assertions.json |
| snippets/sva/21_handshake_fifo_protocol.json | 握手/FIFO 协议断言 | sva.rv.stable, sva.req2ack, sva.no_drop_before_hs, sva.fifo.no_overflow, sva.fifo.no_underflow, sva.latency.bound | assertions + 新增 |
| snippets/sva/22_fsm_arbiter_safety.json | FSM/仲裁安全断言 | sva.arb.onehot, sva.arb.gnt_implies_req, sva.fsm.legal_state, sva.fsm.legal_trans, sva.mutex, sva.onehot0 | assertions + 新增 |
| snippets/sva/23_formal_assume_cover_bind.json | formal/bind | sva.bind, sva.default.clocking, sva.disable.iff, sva.formal.assume.input_stable, sva.formal.cover.reach, sva.known.check | 主要新增 |

### constraints/（5）

| 文件路径 | 职责 | 计划 snippet 名称 | 迁移来源 |
| --- | --- | --- | --- |
| snippets/constraints/30_sdc_clocks_io.json | SDC 时钟与 IO | sdc.clock.create, sdc.clock.generated, sdc.io.input_delay, sdc.io.output_delay | snippets/constraints/sdc.json |
| snippets/constraints/31_sdc_exceptions.json | SDC 例外约束 | sdc.false_path, sdc.multicycle, sdc.max_delay, sdc.min_delay, sdc.clock_groups.async, sdc.datapath_only | sdc + 新增 |
| snippets/constraints/32_xdc_clocks_io.json | XDC 时钟与 IO | xdc.clock.create, xdc.clock.generated, xdc.io.input_delay, xdc.io.output_delay, xdc.pin.package, xdc.io.standard | snippets/constraints/xdc.json |
| snippets/constraints/33_xdc_queries_debug.json | XDC 查询与调试 | xdc.query.cells, xdc.query.pins.safe, xdc.debug.dont_touch, xdc.debug.mark_debug, xdc.query.nets, xdc.query.ports | xdc |
| snippets/constraints/34_sta_reports_queries.json | STA 报告与查询 | sta.report.timing_summary, sta.report.excepts, sta.report.clocks, sta.report.clock_interaction, sta.query.path, sta.query.collection.foreach | 新增 |

### uvm/（7）

| 文件路径 | 职责 | 计划 snippet 名称 | 迁移来源 |
| --- | --- | --- | --- |
| snippets/uvm/40_uvm_base.json | UVM 基础骨架 | uvm.comp, uvm.obj, uvm.new.comp, uvm.new.obj, uvm.utils.comp, uvm.utils.obj | snippets/verification/uvm/base_classes.json, snippets/verification/uvm/uvm_basic.json |
| snippets/uvm/41_uvm_sequence_item_sequence.json | sequence_item/sequence | uvm.seq_item, uvm.seq, uvm.start_item, uvm.finish_item, uvm.randomize.with, uvm.seq.body | uvm_basic + 新增 |
| snippets/uvm/42_uvm_driver_monitor_sequencer.json | driver/monitor/sequencer | uvm.driver, uvm.monitor, uvm.sequencer, uvm.seq_item_port.get_next, uvm.seq_item_port.try_next, uvm.analysis.write | uvm_basic + 新增 |
| snippets/uvm/43_uvm_agent_env_test.json | agent/env/test | uvm.agent, uvm.agent.active_passive, uvm.env, uvm.test, uvm.scoreboard, uvm.subscriber | 主要新增 |
| snippets/uvm/44_uvm_factory_config_db.json | factory/config_db | uvm.factory.override, uvm.create.comp, uvm.create.obj, uvm.cfg.set, uvm.cfg.get, uvm.cfg.exists, uvm.utils.fields | snippets/verification/uvm/factory.json, snippets/verification/uvm/uvm_basic.json |
| snippets/uvm/45_uvm_tlm_analysis.json | tlm/analysis | uvm.tlm.port, uvm.tlm.export, uvm.analysis.port, uvm.analysis.export, uvm.analysis.imp, uvm.analysis.fifo, uvm.tlm.fifo | snippets/verification/uvm/tlm.json, snippets/verification/uvm/uvm_basic.json |
| snippets/uvm/46_uvm_messages_phases.json | 消息与 phase | uvm.phase.build, uvm.phase.connect, uvm.phase.run, uvm.phase.check, uvm.phase.report, uvm.objection, uvm.info, uvm.error, uvm.fatal | snippets/verification/uvm/factory.json, snippets/verification/uvm/uvm_basic.json |

## 收录边界（关键）

- snippets/rtl/13_fifo_queue_buffer.json 只收“通用骨架”，不收项目耦合完整实现。
- templates 目录本阶段仅保留目录，不放 JSON（避免与 34 文件目标冲突）。
- package.json 当前仍指向 legacy snippets，待内容迁移与验证后再切换。
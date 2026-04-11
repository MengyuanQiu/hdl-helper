import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { FastParser } from './src/project/fastParser';
import { AstParser } from './src/project/astParser';

const testCode = `
module sync_fifo_gen
import rtl_pkg::*;
#(
    parameter  int FIFO_DEPTH = 16,
    parameter  int FIFO_WIDTH = 32,
    parameter  rtl_mode_e FWFT_MODE = RTL_MODE_PASSIVE,
    localparam int ADDR_WIDTH = $clog2(FIFO_DEPTH),
    localparam int CNT_WIDTH = $clog2(FIFO_DEPTH + 1)
) (
    input logic clk_i,
    input logic rst_ni,

    // Write Interface
    input  logic                  wr_en_i,
    input  logic [FIFO_WIDTH-1:0] din_i,
    output logic                  full_o,

    // Read Interface
    input  logic                  rd_en_i,
    output logic [FIFO_WIDTH-1:0] dout_o,
    output logic                  empty_o,

    // Status
    output logic [CNT_WIDTH-1:0] wat_level_o  // Renamed for clarity
);
endmodule
`;

async function test() {
    // Mocks for vscode
    const uri = { fsPath: '/test.sv' };
    
    // Test FastParser
    console.log("=== FastParser ===");
    const fpModules = FastParser.parse(testCode, uri);
    if (fpModules.length > 0) {
        console.log("Name:", fpModules[0].name);
        console.log("Ports:", fpModules[0].ports.length);
        console.log("Params:", fpModules[0].params.length);
        console.log("Ports list:", fpModules[0].ports.map(p => p.name).join(', '));
        console.log("Params list:", fpModules[0].params.map(p => p.name).join(', '));
    } else {
        console.log("No modules found by FastParser");
    }
}

test();

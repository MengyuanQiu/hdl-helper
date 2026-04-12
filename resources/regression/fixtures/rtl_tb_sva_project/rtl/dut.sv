module dut(
    input logic clk_i,
    input logic req_i,
    output logic ack_o
);
    assign ack_o = clk_i & req_i;
endmodule

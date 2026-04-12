module tb_top;
    logic clk;
    logic req;
    logic ack;

    dut u_dut (
        .clk_i(clk),
        .req_i(req),
        .ack_o(ack)
    );

    initial begin
        clk = 1'b0;
        req = 1'b0;
        #5 req = 1'b1;
    end
endmodule

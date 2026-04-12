module tb_top;
    logic clk;
    logic out;

    dut u_dut (
        .clk_i(clk),
        .out_o(out)
    );

    initial begin
        clk = 1'b0;
        #10 clk = 1'b1;
    end
endmodule

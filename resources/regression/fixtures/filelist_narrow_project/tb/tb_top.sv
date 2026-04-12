module tb_top;
    logic clk;
    logic pass;

    dut u_dut (
        .clk_i(clk),
        .pass_o(pass)
    );

    initial begin
        clk = 1'b0;
        #5 clk = 1'b1;
    end
endmodule

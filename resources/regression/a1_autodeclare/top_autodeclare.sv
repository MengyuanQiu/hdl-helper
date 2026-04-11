module top_autodeclare;
    logic       clk;
    logic [7:0] bus;

    // commented connection style
    child u_child_comment (
        .clk    (clk),      // clock connection
        .data_i (bus[7:0]), // bit-select expression
        .done_o (done_flag) // should be auto-declared
    );

    // plain style without comments
    child u_child_plain (
        .clk    (clk),
        .data_i (bus),
        .done_o (done_plain)
    );
endmodule
